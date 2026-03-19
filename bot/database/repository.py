from datetime import datetime, timezone

from database.database import insert_rows, select_rows, update_rows
from services.config import (
    COMMISSIONS_TABLE,
    EXERCISES_TABLE,
    GAMIFICATION_TABLE,
    PROFILES_TABLE,
    PRACTICE_SESSION_ITEMS_TABLE,
    PRACTICE_SESSIONS_TABLE,
    USER_PROGRESS_TABLE,
)


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _normalize_commission(raw_row):
    if isinstance(raw_row, list):
        raw_row = raw_row[0] if raw_row else None
    if not raw_row:
        return None

    return {
        "id": raw_row.get("id"),
        "course_level": raw_row.get("course_level"),
        "commission_number": raw_row.get("commission_number"),
        "start_date": raw_row.get("start_date"),
        "start_month": raw_row.get("start_month"),
        "end_date": raw_row.get("end_date"),
        "status": raw_row.get("status"),
        "is_active": raw_row.get("is_active"),
    }


def _normalize_student_row(row):
    if not row:
        return None

    return {
        "id": row.get("id"),
        "email": row.get("email"),
        "full_name": row.get("full_name"),
        "role": row.get("role"),
        "status": row.get("status"),
        "course_level": row.get("course_level"),
        "enrollment_date": row.get("enrollment_date"),
        "start_month": row.get("start_month"),
        "commission_id": row.get("commission_id"),
        "discord_user_id": row.get("discord_user_id"),
        "discord_username": row.get("discord_username"),
        "discord_connected_at": row.get("discord_connected_at"),
        "commission": _normalize_commission(row.get("commission")),
    }


def _student_select_columns():
    return (
        "id,email,full_name,role,status,course_level,enrollment_date,start_month,"
        "commission_id,discord_user_id,discord_username,discord_connected_at,"
        f"commission:{COMMISSIONS_TABLE}(id,course_level,commission_number,start_date,start_month,end_date,status,is_active)"
    )


def _select_students(filters=None, order=None, limit=None):
    rows = select_rows(
        PROFILES_TABLE,
        columns=_student_select_columns(),
        filters=filters,
        order=order,
        limit=limit,
    )
    return [_normalize_student_row(row) for row in rows if row]


def get_student_by_id(student_id):
    rows = _select_students(filters=[("id", "eq", str(student_id))], limit=1)
    return rows[0] if rows else None


def get_student_by_email(email):
    normalized_email = str(email or "").strip()
    if not normalized_email:
        return None
    rows = _select_students(filters=[("email", "ilike", normalized_email)], limit=1)
    return rows[0] if rows else None


def get_student_by_discord_id(discord_id):
    rows = _select_students(filters=[("discord_user_id", "eq", str(discord_id))], limit=1)
    return rows[0] if rows else None


def list_linked_students():
    return _select_students(
        filters=[
            ("role", "eq", "student"),
            ("discord_user_id", "not.is", None),
        ],
        order="created_at.desc",
    )


def update_student_discord_link(student_id, discord_id, discord_username=None, connected_at=None):
    payload = {
        "discord_user_id": str(discord_id),
        "discord_username": discord_username,
        "discord_connected_at": connected_at or _utc_now_iso(),
    }
    rows = update_rows(PROFILES_TABLE, payload, [("id", "eq", str(student_id))])
    return _normalize_student_row(rows[0]) if rows else get_student_by_id(student_id)


def update_student_discord_username(student_id, discord_username=None):
    rows = update_rows(
        PROFILES_TABLE,
        {"discord_username": discord_username},
        [("id", "eq", str(student_id))],
    )
    return _normalize_student_row(rows[0]) if rows else get_student_by_id(student_id)


def list_commissions():
    return select_rows(
        COMMISSIONS_TABLE,
        columns="id,course_level,commission_number,start_date,start_month,end_date,status,is_active",
        order="start_date.desc",
    )


def list_published_practice_exercises(cefr_level=None):
    filters = [
        ("status", "eq", "published"),
        ("practice_enabled", "eq", "true"),
    ]
    if cefr_level:
        filters.append(("cefr_level", "eq", str(cefr_level).upper()))
    return select_rows(
        EXERCISES_TABLE,
        columns=(
            "id,type,kind,status,ordering,payload,content_json,updated_at,"
            "skill_tag,cefr_level,category_id,practice_enabled,ranked_allowed,"
            "difficulty_score,estimated_time_sec,practice_weight,theme_tags,scenario_tags"
        ),
        filters=filters,
        order="ordering.asc",
    )


def list_global_user_progress(user_id):
    return select_rows(
        USER_PROGRESS_TABLE,
        columns=(
            "id,user_id,exercise_id,is_correct,attempts,last_practiced,interval_days,"
            "ease_factor,next_due_at,last_quality,times_seen,times_correct,streak_count,lesson_id"
        ),
        filters=[
            ("user_id", "eq", str(user_id)),
            ("lesson_id", "is", None),
        ],
    )


def get_global_user_progress(user_id, exercise_id):
    rows = select_rows(
        USER_PROGRESS_TABLE,
        columns=(
            "id,user_id,exercise_id,is_correct,attempts,last_practiced,interval_days,"
            "ease_factor,next_due_at,last_quality,times_seen,times_correct,streak_count,lesson_id"
        ),
        filters=[
            ("user_id", "eq", str(user_id)),
            ("exercise_id", "eq", str(exercise_id)),
            ("lesson_id", "is", None),
        ],
        limit=1,
    )
    return rows[0] if rows else None


def save_global_user_progress(user_id, exercise_id, payload):
    existing = get_global_user_progress(user_id, exercise_id)
    if existing:
        rows = update_rows(
            USER_PROGRESS_TABLE,
            payload,
            [("id", "eq", str(existing["id"]))],
        )
        return rows[0] if rows else existing

    insert_payload = {
        "user_id": str(user_id),
        "exercise_id": str(exercise_id),
        "lesson_id": None,
        "created_at": _utc_now_iso(),
        **payload,
    }
    rows = insert_rows(USER_PROGRESS_TABLE, [insert_payload])
    return rows[0] if rows else insert_payload


def abandon_active_practice_sessions(user_id, source_context=None):
    filters = [
        ("user_id", "eq", str(user_id)),
        ("status", "eq", "active"),
    ]
    if source_context:
        filters.append(("source_context", "eq", source_context))
    return update_rows(
        PRACTICE_SESSIONS_TABLE,
        {
            "status": "abandoned",
            "updated_at": _utc_now_iso(),
        },
        filters,
    )


def create_practice_session(user_id, mode, session_size, total_items, source_context=None, filters=None, time_limit_sec=None):
    rows = insert_rows(
        PRACTICE_SESSIONS_TABLE,
        [
            {
                "user_id": str(user_id),
                "mode": mode,
                "status": "active",
                "source_context": source_context,
                "filters": filters or {},
                "session_size": session_size,
                "total_items": total_items,
                "time_limit_sec": time_limit_sec,
            }
        ],
    )
    return rows[0] if rows else None


def create_practice_session_items(session_id, items):
    payload = []
    for index, item in enumerate(items, start=1):
        payload.append(
            {
                "practice_session_id": str(session_id),
                "exercise_id": str(item["id"]),
                "position": index,
                "source_reason": item.get("source_reason") or item.get("mode") or "new",
                "exercise_type": item.get("type"),
                "skill_tag": item.get("skill_tag"),
                "cefr_level": item.get("cefr_level"),
                "category_id": item.get("category_id"),
            }
        )
    rows = insert_rows(PRACTICE_SESSION_ITEMS_TABLE, payload)
    return sorted(rows, key=lambda row: int(row.get("position") or 0))


def update_practice_session_item(practice_item_id, payload):
    rows = update_rows(
        PRACTICE_SESSION_ITEMS_TABLE,
        payload,
        [("id", "eq", str(practice_item_id))],
    )
    return rows[0] if rows else None


def update_practice_session(session_id, payload):
    rows = update_rows(
        PRACTICE_SESSIONS_TABLE,
        payload,
        [("id", "eq", str(session_id))],
    )
    return rows[0] if rows else None


def get_gamification_profile(user_id):
    rows = select_rows(
        GAMIFICATION_TABLE,
        columns=(
            "user_id,lifetime_xp,practice_xp,flashcard_xp,practice_sessions_completed,"
            "flashcard_sessions_completed,perfect_sessions,timed_challenges_completed,created_at,updated_at"
        ),
        filters=[("user_id", "eq", str(user_id))],
        limit=1,
    )
    return rows[0] if rows else None


def create_gamification_profile(user_id, lifetime_xp=0):
    rows = insert_rows(
        GAMIFICATION_TABLE,
        [
            {
                "user_id": str(user_id),
                "lifetime_xp": int(lifetime_xp or 0),
                "practice_xp": int(lifetime_xp or 0),
                "flashcard_xp": 0,
            }
        ],
    )
    return rows[0] if rows else None


def update_gamification_profile(user_id, payload):
    rows = update_rows(
        GAMIFICATION_TABLE,
        payload,
        [("user_id", "eq", str(user_id))],
    )
    return rows[0] if rows else None


def update_profile_xp(user_id, xp_total):
    rows = update_rows(
        PROFILES_TABLE,
        {"xp_total": int(xp_total or 0)},
        [("id", "eq", str(user_id))],
    )
    return rows[0] if rows else None
