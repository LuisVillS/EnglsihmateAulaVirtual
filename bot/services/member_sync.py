import asyncio

from database.repository import (
    get_student_by_discord_id,
    list_linked_students,
    update_student_discord_username,
)
from services.config import (
    AUTO_BACKGROUND_ROLE_RECONCILIATION,
    AUTO_ROLE_SYNC_ON_JOIN,
    ROLE_RECONCILIATION_BATCH_PAUSE_SECONDS,
    ROLE_RECONCILIATION_BATCH_SIZE,
    ROLE_RECONCILIATION_INTERVAL_SECONDS,
    ROLE_RECONCILIATION_STARTUP_DELAY_SECONDS,
)
from services.role_sync import (
    clear_member_academic_roles,
    is_managed_academic_role,
    resolve_student_role_name,
    sync_member_academic_role,
)


RECONCILIATION_LOCK = asyncio.Lock()


def _chunk_list(items, size):
    safe_size = max(1, int(size or 1))
    for index in range(0, len(items), safe_size):
        yield items[index:index + safe_size]


async def _pause_between_batches():
    pause_seconds = max(0, int(ROLE_RECONCILIATION_BATCH_PAUSE_SECONDS or 0))
    if pause_seconds:
        await asyncio.sleep(pause_seconds)


async def _prepare_guild_member_cache(guild):
    if getattr(guild, "chunked", False):
        return
    try:
        await guild.chunk()
    except Exception:
        return


async def _fetch_guild_member(guild, discord_id):
    cached_member = guild.get_member(int(discord_id))
    if cached_member:
        return cached_member
    try:
        return await guild.fetch_member(int(discord_id))
    except Exception:
        return None


def _member_discord_username(member):
    return member.name or getattr(member, "global_name", None) or getattr(member, "display_name", None)


def _format_result(student=None, sync_result=None):
    sync_result = sync_result or {}
    return {
        "student": student,
        "target_role_name": sync_result.get("target_role_name") or "",
        "assigned": sync_result.get("assigned") or "",
        "removed": sync_result.get("removed") or [],
        "changed": bool(sync_result.get("changed")),
        "in_sync": bool(sync_result.get("in_sync")),
        "blocked_reason": sync_result.get("blocked_reason") or "",
    }


async def sync_member_roles(member, student=None):
    student = student or get_student_by_discord_id(member.id)
    if not student:
        return _format_result(student=None)

    current_username = _member_discord_username(member)
    if student.get("id") and (student.get("discord_username") or None) != (current_username or None):
        try:
            updated = update_student_discord_username(student["id"], current_username or None)
            if updated:
                student = updated
        except Exception as exc:
            print(f"Could not update Discord username for student {student.get('id')}: {exc}")

    sync_result = await sync_member_academic_role(member, student)
    return _format_result(student=student, sync_result=sync_result)


async def reconcile_member_link_state(member):
    student = get_student_by_discord_id(member.id)
    if not student:
        removed = await clear_member_academic_roles(member)
        return {
            "student": None,
            "target_role_name": "",
            "assigned": "",
            "removed": removed,
            "changed": bool(removed),
        }

    sync_result = await sync_member_academic_role(member, student)
    return _format_result(student=student, sync_result=sync_result)


async def reconcile_guild_linked_students(guild, expected_role_name=None):
    students = list_linked_students()
    if expected_role_name:
        students = [
            student
            for student in students
            if resolve_student_role_name(student) == expected_role_name
        ]

    stats = {
        "processed": 0,
        "synced": 0,
        "removed": 0,
        "missing_members": 0,
        "blocked": 0,
    }
    for batch in _chunk_list(students, ROLE_RECONCILIATION_BATCH_SIZE):
        for student in batch:
            discord_id = str(student.get("discord_user_id") or "").strip()
            if not discord_id:
                continue

            member = await _fetch_guild_member(guild, discord_id)
            if not member:
                stats["missing_members"] += 1
                continue

            result = await sync_member_roles(member, student=student)
            stats["processed"] += 1
            if result.get("in_sync"):
                stats["synced"] += 1
            elif result.get("blocked_reason"):
                stats["blocked"] += 1
            stats["removed"] += len(result.get("removed") or [])

        await _pause_between_batches()

    return stats


def _collect_cached_academic_members(guild):
    members_by_id = {}
    for role in guild.roles:
        if not is_managed_academic_role(role.name):
            continue
        for member in role.members:
            members_by_id[member.id] = member
    return sorted(members_by_id.values(), key=lambda member: member.id)


async def reconcile_guild_academic_role_holders(guild):
    members = _collect_cached_academic_members(guild)
    stats = {
        "processed": 0,
        "removed": 0,
        "cleared_unlinked": 0,
    }

    for batch in _chunk_list(members, ROLE_RECONCILIATION_BATCH_SIZE):
        for member in batch:
            result = await reconcile_member_link_state(member)
            if not result.get("changed"):
                continue

            stats["processed"] += 1
            stats["removed"] += len(result.get("removed") or [])
            if not result.get("student") and result.get("removed"):
                stats["cleared_unlinked"] += 1

        await _pause_between_batches()

    return stats


async def reconcile_guild_members(guild, expected_role_name=None, include_role_holders=True):
    stats = await reconcile_guild_linked_students(
        guild,
        expected_role_name=expected_role_name,
    )
    if include_role_holders and not expected_role_name:
        holder_stats = await reconcile_guild_academic_role_holders(guild)
        stats["role_holder_repairs"] = holder_stats["processed"]
        stats["cleared_unlinked"] = holder_stats["cleared_unlinked"]
        stats["removed"] += holder_stats["removed"]
    else:
        stats["role_holder_repairs"] = 0
        stats["cleared_unlinked"] = 0
    return stats


async def _run_reconciliation_pass(bot, startup=False):
    async with RECONCILIATION_LOCK:
        for guild in bot.guilds:
            if startup:
                await _prepare_guild_member_cache(guild)
            try:
                stats = await reconcile_guild_members(guild)
            except Exception as exc:
                print(f"Role reconciliation failed for guild {guild.id}: {exc}")
                continue

            if stats["processed"] or stats["removed"] or stats["cleared_unlinked"]:
                print(
                    "Role reconciliation completed "
                    f"for guild {guild.id}: processed={stats['processed']} "
                    f"synced={stats['synced']} removed={stats['removed']} "
                    f"missing_members={stats['missing_members']} "
                    f"cleared_unlinked={stats['cleared_unlinked']} "
                    f"blocked={stats.get('blocked', 0)}"
                )


async def _startup_reconciliation_task(bot):
    await bot.wait_until_ready()
    startup_delay = max(0, int(ROLE_RECONCILIATION_STARTUP_DELAY_SECONDS or 0))
    if startup_delay:
        await asyncio.sleep(startup_delay)
    await _run_reconciliation_pass(bot, startup=True)
    bot._role_sync_startup_completed = True


async def _periodic_reconciliation_task(bot):
    await bot.wait_until_ready()
    while not bot.is_closed():
        interval = max(30, int(ROLE_RECONCILIATION_INTERVAL_SECONDS or 300))
        await asyncio.sleep(interval)
        await _run_reconciliation_pass(bot, startup=False)


def _ensure_background_tasks(bot):
    startup_task = getattr(bot, "_role_sync_startup_task", None)
    if not getattr(bot, "_role_sync_startup_completed", False) and (not startup_task or startup_task.done()):
        bot._role_sync_startup_task = bot.loop.create_task(_startup_reconciliation_task(bot))

    if AUTO_BACKGROUND_ROLE_RECONCILIATION:
        periodic_task = getattr(bot, "_role_sync_periodic_task", None)
        if not periodic_task or periodic_task.done():
            bot._role_sync_periodic_task = bot.loop.create_task(_periodic_reconciliation_task(bot))


def setup(bot):
    @bot.event
    async def on_ready():
        if not hasattr(bot, "_role_sync_startup_completed"):
            bot._role_sync_startup_completed = False
        _ensure_background_tasks(bot)

    @bot.event
    async def on_member_join(member):
        if not AUTO_ROLE_SYNC_ON_JOIN:
            return

        result = await sync_member_roles(member)
        if result.get("assigned") or result.get("removed"):
            changes = []
            if result.get("assigned"):
                changes.append(f"assigned {result['assigned']}")
            if result.get("removed"):
                changes.append(f"removed {', '.join(result['removed'])}")
            print(f"Auto role sync for {member}: {'; '.join(changes)}")
