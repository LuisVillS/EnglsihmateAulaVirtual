from database.repository import (
    create_gamification_profile,
    get_gamification_profile,
    update_gamification_profile,
    update_profile_xp,
)


def _to_int(value):
    try:
        return max(0, int(round(float(value or 0))))
    except (TypeError, ValueError):
        return 0


def _map_profile(row, legacy_xp_total=0):
    lifetime_xp = max(_to_int((row or {}).get("lifetime_xp")), _to_int(legacy_xp_total))
    return {
        "user_id": (row or {}).get("user_id"),
        "lifetime_xp": lifetime_xp,
        "practice_xp": _to_int((row or {}).get("practice_xp")),
        "flashcard_xp": _to_int((row or {}).get("flashcard_xp")),
        "practice_sessions_completed": _to_int((row or {}).get("practice_sessions_completed")),
        "flashcard_sessions_completed": _to_int((row or {}).get("flashcard_sessions_completed")),
        "perfect_sessions": _to_int((row or {}).get("perfect_sessions")),
        "timed_challenges_completed": _to_int((row or {}).get("timed_challenges_completed")),
    }


def ensure_gamification_profile(user_id, legacy_xp_total=0):
    row = get_gamification_profile(user_id)
    if not row:
        row = create_gamification_profile(user_id, lifetime_xp=_to_int(legacy_xp_total))

    normalized = _map_profile(row, legacy_xp_total=legacy_xp_total)
    if normalized["lifetime_xp"] > _to_int((row or {}).get("lifetime_xp")):
        row = update_gamification_profile(
            user_id,
            {
                "lifetime_xp": normalized["lifetime_xp"],
                "practice_xp": max(normalized["lifetime_xp"], _to_int((row or {}).get("practice_xp"))),
            },
        )
        normalized = _map_profile(row, legacy_xp_total=normalized["lifetime_xp"])
    return normalized


def apply_gamification_delta(
    user_id,
    legacy_xp_total=0,
    xp_delta=0,
    practice_xp_delta=0,
    flashcard_xp_delta=0,
    stats=None,
):
    stats = stats or {}
    profile = ensure_gamification_profile(user_id, legacy_xp_total=legacy_xp_total)

    next_lifetime_xp = profile["lifetime_xp"] + _to_int(xp_delta)
    next_practice_xp = profile["practice_xp"] + _to_int(practice_xp_delta)
    next_flashcard_xp = profile["flashcard_xp"] + _to_int(flashcard_xp_delta)

    update_gamification_profile(
        user_id,
        {
            "lifetime_xp": next_lifetime_xp,
            "practice_xp": next_practice_xp,
            "flashcard_xp": next_flashcard_xp,
            "practice_sessions_completed": profile["practice_sessions_completed"] + _to_int(stats.get("practice_sessions_completed")),
            "flashcard_sessions_completed": profile["flashcard_sessions_completed"] + _to_int(stats.get("flashcard_sessions_completed")),
            "perfect_sessions": profile["perfect_sessions"] + _to_int(stats.get("perfect_sessions")),
            "timed_challenges_completed": profile["timed_challenges_completed"] + _to_int(stats.get("timed_challenges_completed")),
        },
    )
    update_profile_xp(user_id, next_lifetime_xp)
    return ensure_gamification_profile(user_id, legacy_xp_total=next_lifetime_xp)
