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

USERS_TABLE = get_setting("USERS_TABLE", "discord_role_assignments")
USERS_EMAIL_COLUMN = get_setting("USERS_EMAIL_COLUMN", "email")
USERS_DISCORD_ID_COLUMN = get_setting("USERS_DISCORD_ID_COLUMN", "discord_user_id")
USERS_COURSE_COLUMN = get_setting("USERS_COURSE_COLUMN", "course_name")
LINK_TARGET_TABLE = get_setting("LINK_TARGET_TABLE", "profiles")
LINK_TARGET_EMAIL_COLUMN = get_setting("LINK_TARGET_EMAIL_COLUMN", "email")
LINK_TARGET_DISCORD_ID_COLUMN = get_setting("LINK_TARGET_DISCORD_ID_COLUMN", "discord_user_id")

QUIZ_QUESTIONS_TABLE = get_setting("QUIZ_QUESTIONS_TABLE", "preguntas_banquea")
QUIZ_SCORES_TABLE = get_setting("QUIZ_SCORES_TABLE", "puntaje_banquea")

AUTO_ROLE_SYNC_ON_JOIN = get_setting("AUTO_ROLE_SYNC_ON_JOIN", "false").lower() == "true"

BOT_TIMEZONE = get_setting("BOT_TIMEZONE", "America/Lima")
DAILY_EMAIL_HOUR = get_int_setting("DAILY_EMAIL_HOUR", 20)
DAILY_EMAIL_MINUTE = get_int_setting("DAILY_EMAIL_MINUTE", 52)

