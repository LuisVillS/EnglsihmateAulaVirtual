import asyncio
import re
from datetime import datetime, timezone

import discord

from services.config import AUTO_CREATE_ACADEMIC_ROLES


COURSE_LEVELS = (
    "BASICO A1",
    "BASICO A2",
    "INTERMEDIO B1",
    "INTERMEDIO B2",
    "AVANZADO C1",
)

COURSE_ROLE_PATTERN = re.compile(
    r"^(BASICO A1|BASICO A2|INTERMEDIO B1|INTERMEDIO B2|AVANZADO C1)\s+\d{4}(?:-\d{2})?$",
    re.IGNORECASE,
)
ALUMNI_ROLE_NAME = "Alumni"
ROLE_CREATE_LOCKS = {}
ROLE_MUTATION_LOCK = asyncio.Lock()


def _normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def _find_role_by_name(guild, role_name):
    normalized_target = _normalize_space(role_name).casefold()
    for role in guild.roles:
        if _normalize_space(role.name).casefold() == normalized_target:
            return role
    return None


def _extract_year_month(value):
    match = re.match(r"^(\d{4})-(\d{1,2})", str(value or "").strip())
    if not match:
        return ""
    year = match.group(1)
    month = match.group(2).zfill(2)
    return f"{year}-{month}"


def format_course_level(course_level):
    normalized = _normalize_space(course_level).upper()
    if not normalized:
        return ""

    words = []
    for token in normalized.split(" "):
        if re.fullmatch(r"[A-Z]\d", token):
            words.append(token)
        else:
            words.append(token.capitalize())
    return " ".join(words)


def resolve_assignment_period(student):
    commission = student.get("commission") or {}
    for raw_value in (
        commission.get("start_date"),
        commission.get("start_month"),
        student.get("start_month"),
        student.get("enrollment_date"),
    ):
        period = _extract_year_month(raw_value)
        if period:
            return period
    return ""


def _parse_date_only(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw[:10]).date()
    except ValueError:
        return None


def _is_inactive_commission(commission):
    if not commission or not commission.get("id"):
        return False
    if commission.get("is_active") is False:
        return True
    status = str(commission.get("status") or "").strip().lower()
    if status in {"inactive", "archived"}:
        return True
    end_date = _parse_date_only(commission.get("end_date"))
    if end_date and end_date < datetime.now(timezone.utc).date():
        return True
    return False


def resolve_student_role_name(student):
    commission = student.get("commission") or {}
    if _is_inactive_commission(commission):
        return ALUMNI_ROLE_NAME
    course_level = commission.get("course_level") or student.get("course_level") or ""
    period = resolve_assignment_period(student)
    formatted_course = format_course_level(course_level)
    if not formatted_course or not period:
        return ""
    return f"{formatted_course} {period}"


def is_managed_academic_role(role_name):
    normalized = _normalize_space(role_name).upper()
    if normalized == ALUMNI_ROLE_NAME.upper():
        return True
    return bool(COURSE_ROLE_PATTERN.match(normalized))


def list_member_academic_roles(member):
    return [
        role
        for role in member.roles
        if role.name != "@everyone" and is_managed_academic_role(role.name)
    ]


async def ensure_academic_role(guild, role_name):
    if not role_name:
        return None

    existing = _find_role_by_name(guild, role_name)
    if existing or not AUTO_CREATE_ACADEMIC_ROLES:
        return existing

    lock_key = f"{guild.id}:{role_name.casefold()}"
    role_lock = ROLE_CREATE_LOCKS.setdefault(lock_key, asyncio.Lock())
    async with role_lock:
        existing = _find_role_by_name(guild, role_name)
        if existing:
            return existing

        bot_member = getattr(guild, "me", None)
        if not bot_member:
            try:
                bot_member = await guild.fetch_member(guild._state.user.id)
            except Exception:
                bot_member = None

        try:
            created_role = await guild.create_role(
                name=role_name,
                reason="EnglishMate academic role sync",
            )
            if bot_member and bot_member.top_role and created_role < bot_member.top_role:
                desired_position = max(1, bot_member.top_role.position - 1)
                current_position = getattr(created_role, "position", 0) or 0
                if desired_position > current_position:
                    try:
                        created_role = await created_role.edit(
                            position=desired_position,
                            reason="Keep academic role below bot hierarchy",
                        )
                    except Exception as exc:
                        print(
                            f"Created academic role '{role_name}' in guild {guild.id} but could not move it "
                            f"below bot top role: {exc}"
                        )
            return created_role
        except Exception as exc:
            print(f"Failed to create academic role '{role_name}' in guild {guild.id}: {exc}")
            return _find_role_by_name(guild, role_name)


async def sync_member_academic_role(member, student):
    target_role_name = resolve_student_role_name(student)
    current_managed_roles = list_member_academic_roles(member)
    current_role_names = {role.name for role in current_managed_roles}

    has_target_role = bool(target_role_name) and target_role_name in current_role_names
    roles_to_remove = [
        role
        for role in current_managed_roles
        if not target_role_name or role.name != target_role_name
    ]
    needs_change = bool(roles_to_remove) or (bool(target_role_name) and not has_target_role)
    if not needs_change:
        return {
            "target_role_name": target_role_name,
            "assigned": "",
            "removed": [],
            "changed": False,
            "in_sync": True,
            "blocked_reason": "",
        }

    assigned_role = None
    added_role_name = ""
    removed_names = []
    blocked_reason = ""

    async with ROLE_MUTATION_LOCK:
        current_managed_roles = list_member_academic_roles(member)
        roles_to_remove = [
            role
            for role in current_managed_roles
            if not target_role_name or role.name != target_role_name
        ]
        if roles_to_remove:
            try:
                await member.remove_roles(*roles_to_remove, reason="EnglishMate academic role sync")
                removed_names = sorted({role.name for role in roles_to_remove})
            except Exception as exc:
                print(
                    f"Failed to remove academic roles from member {member.id} "
                    f"in guild {member.guild.id}: {exc}"
                )
                removed_names = []

        if target_role_name:
            assigned_role = _find_role_by_name(member.guild, target_role_name)
            if not assigned_role or assigned_role not in member.roles:
                assigned_role = await ensure_academic_role(member.guild, target_role_name)
            if assigned_role and assigned_role not in member.roles:
                bot_member = getattr(member.guild, "me", None)
                if not bot_member:
                    try:
                        bot_member = await member.guild.fetch_member(member.guild._state.user.id)
                    except Exception:
                        bot_member = None
                if not bot_member:
                    print(f"Could not resolve bot member in guild {member.guild.id} before assigning '{target_role_name}'.")
                    assigned_role = None
                    blocked_reason = "missing_bot_member"
                elif not bot_member.guild_permissions.manage_roles:
                    print(f"Bot is missing Manage Roles in guild {member.guild.id}; could not assign '{target_role_name}'.")
                    assigned_role = None
                    blocked_reason = "missing_manage_roles"
                elif assigned_role >= bot_member.top_role:
                    print(
                        f"Bot role hierarchy blocks assigning '{target_role_name}' in guild {member.guild.id}. "
                        f"Bot top role: {bot_member.top_role.name}."
                    )
                    assigned_role = None
                    blocked_reason = "role_hierarchy"
                else:
                    try:
                        await member.add_roles(assigned_role, reason="EnglishMate academic role sync")
                        added_role_name = assigned_role.name
                    except Exception as exc:
                        print(
                            f"Failed to assign academic role '{target_role_name}' to member {member.id} "
                            f"in guild {member.guild.id}: {exc}"
                        )
                        assigned_role = None
                        added_role_name = ""
                        blocked_reason = "assign_failed"

    final_managed_roles = list_member_academic_roles(member)
    final_role_names = {role.name for role in final_managed_roles}
    in_sync = (
        (not target_role_name and not final_managed_roles)
        or (
            bool(target_role_name)
            and target_role_name in final_role_names
            and len(final_managed_roles) == 1
        )
    )

    return {
        "target_role_name": target_role_name,
        "assigned": added_role_name,
        "removed": removed_names,
        "changed": bool(removed_names) or bool(added_role_name),
        "in_sync": in_sync,
        "blocked_reason": blocked_reason,
    }


async def clear_member_academic_roles(member):
    roles_to_remove = list_member_academic_roles(member)
    if not roles_to_remove:
        return []

    removed_names = []
    async with ROLE_MUTATION_LOCK:
        roles_to_remove = list_member_academic_roles(member)
        if roles_to_remove:
            try:
                await member.remove_roles(*roles_to_remove, reason="EnglishMate academic role reset")
                removed_names = sorted({role.name for role in roles_to_remove})
            except Exception as exc:
                print(
                    f"Failed to clear academic roles from member {member.id} "
                    f"in guild {member.guild.id}: {exc}"
                )
                removed_names = []
    return removed_names
