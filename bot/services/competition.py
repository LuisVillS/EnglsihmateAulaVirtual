from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from database.database import call_rpc, insert_rows, select_rows, update_rows
from services.config import (
    COMPETITION_WEEKS_TABLE,
    WEEKLY_LEAGUES_TABLE,
    WEEKLY_LEAGUE_MEMBERSHIPS_TABLE,
    WEEKLY_QUEST_DEFINITIONS_TABLE,
    WEEKLY_QUEST_PROGRESS_TABLE,
    WEEKLY_RANK_SNAPSHOTS_TABLE,
)
from services.gamification import apply_gamification_delta


LIMA_TIME_ZONE = ZoneInfo("America/Lima")
LEAGUE_TIERS = ("bronze", "silver", "gold", "diamond")
WEEKLY_QUEST_METRICS = {
    "practice_sessions_completed": "practice_sessions_completed",
    "practice_listening_items_completed": "practice_listening_items_completed",
    "practice_weakness_sessions_completed": "practice_weakness_sessions_completed",
    "flashcard_writing_answers_completed": "flashcard_writing_answers_completed",
    "weekly_xp_earned": "weekly_xp_earned",
}


def _to_int(value):
    try:
        return max(0, int(round(float(value or 0))))
    except (TypeError, ValueError):
        return 0


def _to_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _normalize_tier(value, fallback="bronze"):
    normalized = str(value or "").strip().lower()
    return normalized if normalized in LEAGUE_TIERS else fallback


def _next_tier(tier):
    normalized = _normalize_tier(tier)
    index = LEAGUE_TIERS.index(normalized)
    return LEAGUE_TIERS[min(index + 1, len(LEAGUE_TIERS) - 1)]


def _previous_tier(tier):
    normalized = _normalize_tier(tier)
    index = LEAGUE_TIERS.index(normalized)
    return LEAGUE_TIERS[max(index - 1, 0)]


def _current_utc_iso():
    return datetime.now(timezone.utc).isoformat()


def _get_week_bounds(reference=None):
    reference = reference or datetime.now(timezone.utc)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)

    lima_now = reference.astimezone(LIMA_TIME_ZONE)
    week_start_lima = datetime(
        lima_now.year,
        lima_now.month,
        lima_now.day,
        tzinfo=LIMA_TIME_ZONE,
    ) - timedelta(days=lima_now.weekday())
    week_end_lima = week_start_lima + timedelta(days=7)

    week_start_utc = week_start_lima.astimezone(timezone.utc)
    week_end_utc = week_end_lima.astimezone(timezone.utc)
    week_key = week_start_utc.strftime("%Y-%m-%d")
    title = f"Week of {week_start_utc.strftime('%b')} {week_start_utc.day}"
    return {
        "week_key": week_key,
        "starts_at": week_start_utc.isoformat(),
        "ends_at": week_end_utc.isoformat(),
        "title": title,
    }


def _league_title(tier, cohort_number):
    return f"{_normalize_tier(tier).capitalize()} League {cohort_number}"


def _promotion_state(tier, rank_position, total_members, promotion_slots, demotion_slots):
    normalized_tier = _normalize_tier(tier)
    safe_rank = max(1, _to_int(rank_position))
    safe_total = max(1, _to_int(total_members))
    safe_promotion_slots = _to_int(promotion_slots)
    safe_demotion_slots = _to_int(demotion_slots)

    if safe_rank <= min(safe_total, safe_promotion_slots):
        return "hold" if normalized_tier == "diamond" else "promoted"
    if normalized_tier != "bronze" and safe_total > safe_demotion_slots and safe_rank > safe_total - safe_demotion_slots:
        return "demoted"
    return "safe"


def _get_next_tier_from_snapshot(snapshot):
    current_tier = _normalize_tier((snapshot or {}).get("league_tier"), "bronze")
    promotion_state = str((snapshot or {}).get("promotion_state") or "safe").strip().lower()
    if promotion_state == "promoted":
        return _next_tier(current_tier)
    if promotion_state == "demoted":
        return _previous_tier(current_tier)
    return current_tier


def _get_membership(user_id, week_id):
    rows = select_rows(
        WEEKLY_LEAGUE_MEMBERSHIPS_TABLE,
        columns="*",
        filters=[
            ("week_id", "eq", str(week_id)),
            ("user_id", "eq", str(user_id)),
        ],
        limit=1,
    )
    return rows[0] if rows else None


def _get_league(league_id):
    rows = select_rows(
        WEEKLY_LEAGUES_TABLE,
        columns="*",
        filters=[("id", "eq", str(league_id))],
        limit=1,
    )
    return rows[0] if rows else None


def ensure_current_competition_week():
    try:
        call_rpc("finalize_ended_competition_weeks")
    except Exception:
        pass

    bounds = _get_week_bounds()
    rows = select_rows(
        COMPETITION_WEEKS_TABLE,
        columns="*",
        filters=[("week_key", "eq", bounds["week_key"])],
        limit=1,
    )
    if rows:
        return rows[0]

    inserted = insert_rows(
        COMPETITION_WEEKS_TABLE,
        [
            {
                "week_key": bounds["week_key"],
                "title": bounds["title"],
                "starts_at": bounds["starts_at"],
                "ends_at": bounds["ends_at"],
                "status": "active",
            }
        ],
    )
    return inserted[0] if inserted else None


def _ensure_league_membership(user_id, week):
    existing = _get_membership(user_id, week["id"])
    if existing:
        return existing

    latest_snapshot_rows = select_rows(
        WEEKLY_RANK_SNAPSHOTS_TABLE,
        columns="league_tier,promotion_state,created_at",
        filters=[("user_id", "eq", str(user_id))],
        order="created_at.desc",
        limit=1,
    )
    target_tier = _get_next_tier_from_snapshot(latest_snapshot_rows[0] if latest_snapshot_rows else None)

    leagues = select_rows(
        WEEKLY_LEAGUES_TABLE,
        columns="*",
        filters=[
            ("week_id", "eq", str(week["id"])),
            ("tier", "eq", target_tier),
            ("status", "eq", "active"),
        ],
        order="cohort_number.asc",
    )

    target_league = None
    for league in leagues:
        if _to_int(league.get("member_count")) < _to_int(league.get("max_members")):
            target_league = league
            break

    if not target_league:
        highest_cohort = max([_to_int(league.get("cohort_number")) for league in leagues] or [0])
        inserted_league = insert_rows(
            WEEKLY_LEAGUES_TABLE,
            [
                {
                    "week_id": str(week["id"]),
                    "tier": target_tier,
                    "cohort_number": highest_cohort + 1,
                    "title": _league_title(target_tier, highest_cohort + 1),
                    "max_members": 20,
                    "member_count": 0,
                    "promotion_slots": 3,
                    "demotion_slots": 3,
                    "status": "active",
                }
            ],
        )
        target_league = inserted_league[0] if inserted_league else None

    if not target_league:
        return None

    inserted_membership = insert_rows(
        WEEKLY_LEAGUE_MEMBERSHIPS_TABLE,
        [
            {
                "week_id": str(week["id"]),
                "league_id": str(target_league["id"]),
                "user_id": str(user_id),
                "league_tier": target_tier,
            }
        ],
    )
    membership = inserted_membership[0] if inserted_membership else _get_membership(user_id, week["id"])
    if not membership:
        return None

    league_members = select_rows(
        WEEKLY_LEAGUE_MEMBERSHIPS_TABLE,
        columns="id",
        filters=[("league_id", "eq", str(target_league["id"]))],
    )
    update_rows(
        WEEKLY_LEAGUES_TABLE,
        {
            "member_count": len(league_members),
            "updated_at": _current_utc_iso(),
        },
        [("id", "eq", str(target_league["id"]))],
    )
    return membership


def _refresh_league_ranks(league_id):
    league = _get_league(league_id)
    if not league:
        return

    rows = select_rows(
        WEEKLY_LEAGUE_MEMBERSHIPS_TABLE,
        columns="id,weekly_points,average_accuracy,updated_at",
        filters=[("league_id", "eq", str(league_id))],
        order="weekly_points.desc,average_accuracy.desc,updated_at.asc",
    )
    total_members = max(1, len(rows))
    for index, row in enumerate(rows, start=1):
        update_rows(
            WEEKLY_LEAGUE_MEMBERSHIPS_TABLE,
            {
                "rank_position": index,
                "promotion_state": _promotion_state(
                    league.get("tier"),
                    index,
                    total_members,
                    league.get("promotion_slots"),
                    league.get("demotion_slots"),
                ),
                "updated_at": _current_utc_iso(),
            },
            [("id", "eq", str(row["id"]))],
        )

    update_rows(
        WEEKLY_LEAGUES_TABLE,
        {
            "member_count": total_members,
            "updated_at": _current_utc_iso(),
        },
        [("id", "eq", str(league_id))],
    )


def _ensure_weekly_quest_progress_rows(user_id, week_id):
    definitions = select_rows(
        WEEKLY_QUEST_DEFINITIONS_TABLE,
        columns="*",
        filters=[("is_active", "eq", "true")],
        order="sort_order.asc,created_at.asc",
    )
    if not definitions:
        return []

    existing_rows = select_rows(
        WEEKLY_QUEST_PROGRESS_TABLE,
        columns="id,quest_definition_id,progress_count,target_count,is_completed,completed_at,reward_xp_granted,reward_granted_at",
        filters=[
            ("week_id", "eq", str(week_id)),
            ("user_id", "eq", str(user_id)),
        ],
    )
    existing_ids = {str(row.get("quest_definition_id")) for row in existing_rows}
    inserts = []
    for definition in definitions:
        definition_id = str(definition.get("id"))
        if definition_id in existing_ids:
            continue
        inserts.append(
            {
                "week_id": str(week_id),
                "user_id": str(user_id),
                "quest_definition_id": definition_id,
                "progress_count": 0,
                "target_count": max(1, _to_int(definition.get("target_count"))),
            }
        )

    if inserts:
        insert_rows(WEEKLY_QUEST_PROGRESS_TABLE, inserts)
        existing_rows = select_rows(
            WEEKLY_QUEST_PROGRESS_TABLE,
            columns="id,quest_definition_id,progress_count,target_count,is_completed,completed_at,reward_xp_granted,reward_granted_at",
            filters=[
                ("week_id", "eq", str(week_id)),
                ("user_id", "eq", str(user_id)),
            ],
        )

    definition_by_id = {str(definition["id"]): definition for definition in definitions}
    hydrated = []
    for row in existing_rows:
        definition = definition_by_id.get(str(row.get("quest_definition_id")))
        if not definition:
            continue
        hydrated.append(
            {
                **row,
                "definition": definition,
            }
        )
    return hydrated


def _get_quest_increment(definition, activity):
    metric_type = str((definition or {}).get("metric_type") or "").strip()
    if metric_type == WEEKLY_QUEST_METRICS["practice_sessions_completed"]:
        return _to_int(activity.get("practice_sessions_completed"))
    if metric_type == WEEKLY_QUEST_METRICS["practice_listening_items_completed"]:
        return _to_int(activity.get("listening_items_completed"))
    if metric_type == WEEKLY_QUEST_METRICS["practice_weakness_sessions_completed"]:
        return _to_int(activity.get("weakness_sessions_completed"))
    if metric_type == WEEKLY_QUEST_METRICS["flashcard_writing_answers_completed"]:
        return _to_int(activity.get("flashcard_writing_answers_completed"))
    if metric_type == WEEKLY_QUEST_METRICS["weekly_xp_earned"]:
        return _to_int(activity.get("weekly_xp_earned"))
    return 0


def _update_quest_progress(user_id, week_id, activity, legacy_xp_total=0):
    rows = _ensure_weekly_quest_progress_rows(user_id, week_id)
    reward_xp = 0
    for row in rows:
        definition = row["definition"]
        increment = _get_quest_increment(definition, activity)
        if not increment:
            continue

        target_count = max(1, _to_int(row.get("target_count") or definition.get("target_count")))
        next_progress = min(_to_int(row.get("progress_count")) + increment, target_count)
        completed_before = bool(row.get("reward_granted_at"))
        is_completed = next_progress >= target_count
        grant_reward = is_completed and not completed_before
        quest_reward = _to_int(definition.get("reward_xp")) if grant_reward else 0

        update_rows(
            WEEKLY_QUEST_PROGRESS_TABLE,
            {
                "progress_count": next_progress,
                "is_completed": is_completed,
                "completed_at": row.get("completed_at") or (_current_utc_iso() if is_completed else None),
                "reward_xp_granted": _to_int(row.get("reward_xp_granted")) + quest_reward,
                "reward_granted_at": _current_utc_iso() if grant_reward else row.get("reward_granted_at"),
                "updated_at": _current_utc_iso(),
            },
            [("id", "eq", str(row["id"]))],
        )
        reward_xp += quest_reward

    gamification = None
    if reward_xp > 0:
        gamification = apply_gamification_delta(
            user_id,
            legacy_xp_total=legacy_xp_total,
            xp_delta=reward_xp,
            practice_xp_delta=0,
        )
    return {
        "reward_xp": reward_xp,
        "gamification": gamification,
    }


def calculate_competition_points(activity):
    source = str(activity.get("source") or "").strip().lower()
    if source != "practice":
        return {
            "weekly_points": 0,
            "practice_points": 0,
            "flashcard_points": 0,
            "weekly_xp_earned": 0,
            "practice_sessions_completed": 0,
            "flashcard_sessions_completed": 0,
            "listening_items_completed": 0,
            "weakness_sessions_completed": 0,
            "flashcard_writing_answers_completed": 0,
            "completed_runs": 0,
            "accuracy_score_total": 0,
        }

    answered_items = _to_int(activity.get("answered_items") or activity.get("total_items"))
    correct_items = _to_int(activity.get("correct_items"))
    accuracy_percent = max(0.0, min(100.0, _to_float(activity.get("accuracy_percent"))))
    time_spent_sec = activity.get("time_spent_sec")
    time_spent_sec = None if time_spent_sec is None else max(0, _to_int(time_spent_sec))
    mode = str(activity.get("mode") or "").strip().lower()
    listening_items_completed = _to_int(activity.get("listening_items_completed"))

    meaningful = answered_items >= 6 and correct_items >= 2 and accuracy_percent >= 40
    suspiciously_fast = time_spent_sec is not None and answered_items > 0 and time_spent_sec < answered_items * 4

    points = 0
    if meaningful:
        if accuracy_percent >= 90:
            accuracy_bonus = 8
        elif accuracy_percent >= 80:
            accuracy_bonus = 5
        elif accuracy_percent >= 70:
            accuracy_bonus = 3
        else:
            accuracy_bonus = 0

        points = min(62, (correct_items * 3) + answered_items + accuracy_bonus)
        if mode in {"timed", "weakness"}:
            points += 4
        if suspiciously_fast:
            points = round(points * 0.35)

    return {
        "weekly_points": max(0, points),
        "practice_points": max(0, points),
        "flashcard_points": 0,
        "weekly_xp_earned": max(0, _to_int(activity.get("xp_earned"))),
        "practice_sessions_completed": 1 if meaningful else 0,
        "flashcard_sessions_completed": 0,
        "listening_items_completed": listening_items_completed,
        "weakness_sessions_completed": 1 if meaningful and mode == "weakness" else 0,
        "flashcard_writing_answers_completed": 0,
        "completed_runs": 1 if meaningful else 0,
        "accuracy_score_total": accuracy_percent if meaningful else 0,
    }


def record_competition_activity(user_id, legacy_xp_total=0, activity=None):
    activity = activity or {}
    week = ensure_current_competition_week()
    if not week:
        return {
            "contribution": calculate_competition_points(activity),
            "quest_reward_xp": 0,
            "gamification": None,
        }

    membership = _ensure_league_membership(user_id, week)
    if not membership:
        return {
            "contribution": calculate_competition_points(activity),
            "quest_reward_xp": 0,
            "gamification": None,
        }

    contribution = calculate_competition_points(activity)
    current_accuracy_total = _to_float(membership.get("accuracy_score_total"))
    current_completed_runs = _to_int(membership.get("completed_runs"))
    next_completed_runs = current_completed_runs + _to_int(contribution.get("completed_runs"))
    next_accuracy_total = current_accuracy_total + _to_float(contribution.get("accuracy_score_total"))
    next_average_accuracy = round((next_accuracy_total / next_completed_runs), 2) if next_completed_runs else 0

    update_rows(
        WEEKLY_LEAGUE_MEMBERSHIPS_TABLE,
        {
            "weekly_points": _to_int(membership.get("weekly_points")) + _to_int(contribution.get("weekly_points")),
            "practice_points": _to_int(membership.get("practice_points")) + _to_int(contribution.get("practice_points")),
            "flashcard_points": _to_int(membership.get("flashcard_points")) + _to_int(contribution.get("flashcard_points")),
            "weekly_xp_earned": _to_int(membership.get("weekly_xp_earned")) + _to_int(contribution.get("weekly_xp_earned")),
            "practice_sessions_completed": _to_int(membership.get("practice_sessions_completed")) + _to_int(contribution.get("practice_sessions_completed")),
            "flashcard_sessions_completed": _to_int(membership.get("flashcard_sessions_completed")) + _to_int(contribution.get("flashcard_sessions_completed")),
            "listening_items_completed": _to_int(membership.get("listening_items_completed")) + _to_int(contribution.get("listening_items_completed")),
            "weakness_sessions_completed": _to_int(membership.get("weakness_sessions_completed")) + _to_int(contribution.get("weakness_sessions_completed")),
            "flashcard_writing_answers_completed": _to_int(membership.get("flashcard_writing_answers_completed")) + _to_int(contribution.get("flashcard_writing_answers_completed")),
            "completed_runs": next_completed_runs,
            "accuracy_score_total": next_accuracy_total,
            "average_accuracy": next_average_accuracy,
            "updated_at": _current_utc_iso(),
        },
        [("id", "eq", str(membership["id"]))],
    )

    _refresh_league_ranks(membership["league_id"])
    quest_update = _update_quest_progress(
        user_id,
        week["id"],
        contribution,
        legacy_xp_total=legacy_xp_total,
    )

    return {
        "contribution": contribution,
        "quest_reward_xp": quest_update["reward_xp"],
        "gamification": quest_update["gamification"],
    }
