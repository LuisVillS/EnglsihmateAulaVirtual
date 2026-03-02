import random
from database.database import insert_rows, select_rows, update_rows
from services.config import (
    LINK_TARGET_DISCORD_ID_COLUMN,
    LINK_TARGET_EMAIL_COLUMN,
    LINK_TARGET_TABLE,
    QUIZ_QUESTIONS_TABLE,
    QUIZ_SCORES_TABLE,
    USERS_COURSE_COLUMN,
    USERS_DISCORD_ID_COLUMN,
    USERS_EMAIL_COLUMN,
    USERS_TABLE,
)


def _normalize_user_rows(rows):
    normalized = []
    for row in rows:
        normalized.append(
            {
                "email": row.get(USERS_EMAIL_COLUMN),
                "course": row.get(USERS_COURSE_COLUMN),
                "discord_id": row.get(USERS_DISCORD_ID_COLUMN),
            }
        )
    return normalized


def get_users_by_discord_id(discord_id):
    rows = select_rows(
        USERS_TABLE,
        columns=f"{USERS_EMAIL_COLUMN},{USERS_COURSE_COLUMN},{USERS_DISCORD_ID_COLUMN}",
        filters=[(USERS_DISCORD_ID_COLUMN, "eq", str(discord_id))],
    )
    return _normalize_user_rows(rows)


def get_users_by_email(email):
    rows = select_rows(
        USERS_TABLE,
        columns=f"{USERS_EMAIL_COLUMN},{USERS_COURSE_COLUMN},{USERS_DISCORD_ID_COLUMN}",
        filters=[(USERS_EMAIL_COLUMN, "eq", email)],
    )
    return _normalize_user_rows(rows)


def email_is_linked_to_other_discord_user(email, discord_id):
    rows = get_users_by_email(email)
    return any(row["discord_id"] and str(row["discord_id"]) != str(discord_id) for row in rows)


def link_email_to_discord_user(email, discord_id):
    update_rows(
        LINK_TARGET_TABLE,
        {LINK_TARGET_DISCORD_ID_COLUMN: str(discord_id)},
        [(LINK_TARGET_EMAIL_COLUMN, "eq", email)],
    )


def list_linked_users(course_name=None):
    filters = [(USERS_DISCORD_ID_COLUMN, "not.is", None)]
    if course_name:
        filters.append((USERS_COURSE_COLUMN, "eq", course_name))
    rows = select_rows(
        USERS_TABLE,
        columns=f"{USERS_EMAIL_COLUMN},{USERS_COURSE_COLUMN},{USERS_DISCORD_ID_COLUMN}",
        filters=filters,
    )
    return _normalize_user_rows(rows)


def list_quiz_topics(search):
    rows = select_rows(
        QUIZ_QUESTIONS_TABLE,
        columns="tema",
        filters=[("tema", "ilike", f"*{search}*")],
    )
    return sorted({row.get("tema") for row in rows if row.get("tema")})


def count_quiz_questions(tema):
    rows = select_rows(
        QUIZ_QUESTIONS_TABLE,
        columns="id",
        filters=[("tema", "eq", tema)],
    )
    return len(rows)


def get_random_quiz_questions(tema, amount):
    rows = select_rows(
        QUIZ_QUESTIONS_TABLE,
        columns="id,tema,pregunta,respuesta_correcta,respuesta_incorrecta1,respuesta_incorrecta2,respuesta_incorrecta3,razon",
        filters=[("tema", "eq", tema)],
    )
    if len(rows) <= amount:
        return rows
    return random.sample(rows, amount)


def upsert_quiz_score(user_id, correct_answers, total_questions):
    rows = select_rows(
        QUIZ_SCORES_TABLE,
        columns="user_id,respuestas_correctas,respuestas_incorrectas,veces_jugadas,puntaje_promedio",
        filters=[("user_id", "eq", str(user_id))],
        limit=1,
    )
    incorrect_answers = total_questions - correct_answers
    if rows:
        current = rows[0]
        updated_correct = int(current.get("respuestas_correctas", 0)) + correct_answers
        updated_incorrect = int(current.get("respuestas_incorrectas", 0)) + incorrect_answers
        updated_plays = int(current.get("veces_jugadas", 0)) + 1
        updated_average = (updated_correct / (updated_correct + updated_incorrect)) * 100 if (updated_correct + updated_incorrect) else 0
        update_rows(
            QUIZ_SCORES_TABLE,
            {
                "respuestas_correctas": updated_correct,
                "respuestas_incorrectas": updated_incorrect,
                "veces_jugadas": updated_plays,
                "puntaje_promedio": updated_average,
            },
            [("user_id", "eq", str(user_id))],
        )
        return

    average = (correct_answers / total_questions) * 100 if total_questions else 0
    insert_rows(
        QUIZ_SCORES_TABLE,
        [
            {
                "user_id": int(user_id),
                "respuestas_correctas": correct_answers,
                "respuestas_incorrectas": incorrect_answers,
                "veces_jugadas": 1,
                "puntaje_promedio": average,
            }
        ],
    )
