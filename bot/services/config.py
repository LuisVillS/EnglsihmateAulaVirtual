import os
from functools import lru_cache
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent


def _parse_env_file(path):
    if not path.exists():
        return {}

    values = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        values[key] = value
    return values


@lru_cache(maxsize=1)
def _file_settings():
    values = {}
    for env_path in (
        BASE_DIR / ".env",
        BASE_DIR / ".env.local",
        PROJECT_ROOT / ".env",
        PROJECT_ROOT / ".env.local",
    ):
        for key, value in _parse_env_file(env_path).items():
            if value or key not in values:
                values[key] = value
    return values


def get_setting(name, default=None, aliases=()):
    names = (name, *aliases)
    for key in names:
        value = os.getenv(key)
        if value is not None:
            cleaned = value.strip().strip('"').strip("'")
            if cleaned:
                return cleaned

    file_settings = _file_settings()
    for key in names:
        value = file_settings.get(key)
        if value:
            return value

    return default


def get_int_setting(name, default):
    value = get_setting(name)
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


TOKEN = get_setting("DISCORD_BOT_TOKEN")

SUPABASE_URL = get_setting("NEXT_PUBLIC_SUPABASE_URL", aliases=("SUPABASE_URL",))
SUPABASE_SERVICE_ROLE_KEY = get_setting("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_SCHEMA = get_setting("SUPABASE_SCHEMA", "public")

PROFILES_TABLE = get_setting("PROFILES_TABLE", "profiles")
COMMISSIONS_TABLE = get_setting("COMMISSIONS_TABLE", "course_commissions")
EXERCISES_TABLE = get_setting("EXERCISES_TABLE", "exercises")
USER_PROGRESS_TABLE = get_setting("USER_PROGRESS_TABLE", "user_progress")
GAMIFICATION_TABLE = get_setting("GAMIFICATION_TABLE", "user_gamification_profiles")
PRACTICE_SESSIONS_TABLE = get_setting("PRACTICE_SESSIONS_TABLE", "practice_sessions")
PRACTICE_SESSION_ITEMS_TABLE = get_setting("PRACTICE_SESSION_ITEMS_TABLE", "practice_session_items")
COMPETITION_WEEKS_TABLE = get_setting("COMPETITION_WEEKS_TABLE", "competition_weeks")
WEEKLY_LEAGUES_TABLE = get_setting("WEEKLY_LEAGUES_TABLE", "weekly_leagues")
WEEKLY_LEAGUE_MEMBERSHIPS_TABLE = get_setting("WEEKLY_LEAGUE_MEMBERSHIPS_TABLE", "weekly_league_memberships")
WEEKLY_RANK_SNAPSHOTS_TABLE = get_setting("WEEKLY_RANK_SNAPSHOTS_TABLE", "weekly_rank_snapshots")
WEEKLY_QUEST_DEFINITIONS_TABLE = get_setting("WEEKLY_QUEST_DEFINITIONS_TABLE", "weekly_quest_definitions")
WEEKLY_QUEST_PROGRESS_TABLE = get_setting("WEEKLY_QUEST_PROGRESS_TABLE", "weekly_quest_progress")

AUTO_ROLE_SYNC_ON_JOIN = get_setting("AUTO_ROLE_SYNC_ON_JOIN", "true").lower() == "true"
AUTO_CREATE_ACADEMIC_ROLES = get_setting("AUTO_CREATE_ACADEMIC_ROLES", "true").lower() == "true"
AUTO_BACKGROUND_ROLE_RECONCILIATION = get_setting("AUTO_BACKGROUND_ROLE_RECONCILIATION", "true").lower() == "true"
ROLE_RECONCILIATION_INTERVAL_SECONDS = get_int_setting("ROLE_RECONCILIATION_INTERVAL_SECONDS", 300)
ROLE_RECONCILIATION_BATCH_SIZE = get_int_setting("ROLE_RECONCILIATION_BATCH_SIZE", 20)
ROLE_RECONCILIATION_BATCH_PAUSE_SECONDS = get_int_setting("ROLE_RECONCILIATION_BATCH_PAUSE_SECONDS", 1)
ROLE_RECONCILIATION_STARTUP_DELAY_SECONDS = get_int_setting("ROLE_RECONCILIATION_STARTUP_DELAY_SECONDS", 15)
ROLE_SYNC_REQUIRES_MEMBERS_INTENT = AUTO_ROLE_SYNC_ON_JOIN or AUTO_BACKGROUND_ROLE_RECONCILIATION

PRACTICE_SESSION_SIZE = get_int_setting("PRACTICE_SESSION_SIZE", 12)
PRACTICE_TIMED_SECONDS = get_int_setting("PRACTICE_TIMED_SECONDS", 180)

