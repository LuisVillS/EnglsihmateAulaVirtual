import html
import html
import json
import random
import re
import unicodedata
from datetime import datetime, timedelta, timezone

from database.repository import (
    abandon_active_practice_sessions,
    create_practice_session,
    create_practice_session_items,
    get_global_user_progress,
    get_student_by_id,
    list_global_user_progress,
    list_published_practice_exercises,
    save_global_user_progress,
    update_practice_session,
    update_practice_session_item,
)
from services.competition import record_competition_activity
from services.config import PRACTICE_SESSION_SIZE, PRACTICE_TIMED_SECONDS
from services.gamification import apply_gamification_delta, ensure_gamification_profile


PRACTICE_MODES = {
    "quick": "Quick Practice",
    "mixed_review": "Mixed Review",
    "weakness": "Weakness Recovery",
    "timed": "Timed Challenge",
}

EXERCISE_TYPES = {
    "scramble",
    "image_match",
    "cloze",
}

NEW_TYPE_PRIORITY = [
    "image_match",
    "cloze",
    "scramble",
]

REVIEW_TYPE_PRIORITY = [
    "scramble",
    "cloze",
    "image_match",
]

BLANK_TOKEN_REGEX = re.compile(r"\[\[\s*(blank_[a-z0-9_-]+)\s*\]\]|\[blank\]|_{2,}", re.IGNORECASE)
HTML_TAG_REGEX = re.compile(r"<[^>]+>")


def _utc_now():
    return datetime.now(timezone.utc)


def _utc_now_iso():
    return _utc_now().isoformat()


def _clean_text(value):
    return str(value or "").strip()


def _clean_display_text(value):
    text = _clean_text(value)
    if not text:
        return ""

    text = html.unescape(text)
    text = re.sub(r"(?i)<\s*br\s*/?\s*>", "\n", text)
    text = re.sub(r"(?i)<\s*li[^>]*>", "- ", text)
    text = re.sub(r"(?i)</\s*(p|div|li|ul|ol|h[1-6])\s*>", "\n", text)
    text = HTML_TAG_REGEX.sub("", text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def _normalize_mode(value, fallback="mixed_review"):
    normalized = _clean_text(value).lower()
    return normalized if normalized in PRACTICE_MODES else fallback


def _to_int(value, fallback=0):
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return fallback


def _to_float(value, fallback=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _clamp(value, min_value, max_value):
    return min(max_value, max(min_value, value))


def _parse_json_object(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _normalize_answer_text(value):
    text = str(value or "").lower()
    text = (
        unicodedata.normalize("NFKD", text)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_student_cefr_level(value):
    match = re.search(r"\b(A1|A2|B1|B2|C1|C2)\b", str(value or "").upper())
    return match.group(1) if match else ""


def _quality_from_attempt(is_correct, attempts):
    tries = max(1, _to_int(attempts, 1))
    if not is_correct:
        return 1 if tries >= 3 else 2
    if tries == 1:
        return 5
    if tries == 2:
        return 4
    return 3


def _compute_ease_factor(previous, quality):
    previous = _to_float(previous, 2.5)
    q = _clamp(_to_int(quality), 0, 5)
    updated = previous + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    return round(_clamp(updated, 1.3, 2.8), 2)


def _compute_interval_days(previous_interval, ease_factor, quality):
    previous = max(1, _to_int(previous_interval, 1))
    if _to_int(quality) < 3:
        return 1
    return max(1, round(previous * _to_float(ease_factor, 2.5)))


def _compute_spaced_repetition_update(previous_interval, previous_ease_factor, is_correct, attempts):
    quality = _quality_from_attempt(is_correct, attempts)
    ease_factor = _compute_ease_factor(previous_ease_factor, quality)
    interval_days = _compute_interval_days(previous_interval, ease_factor, quality)
    next_due_at = (_utc_now() + timedelta(days=interval_days)).isoformat()
    return {
        "quality": quality,
        "ease_factor": ease_factor,
        "interval_days": interval_days,
        "next_due_at": next_due_at,
    }


def calculate_practice_item_xp(is_correct, attempts=1, mode="mixed_review"):
    if not is_correct:
        return 1
    if attempts <= 1:
        gain = 12
    elif attempts == 2:
        gain = 9
    else:
        gain = 7
    if mode == "timed":
        gain += 2
    return gain


def calculate_session_bonus(mode, total_items, correct_items, answered_items):
    total_items = max(0, _to_int(total_items))
    correct_items = max(0, _to_int(correct_items))
    answered_items = max(0, _to_int(answered_items))
    if not total_items:
        return 0

    accuracy = correct_items / total_items
    bonus = 10
    if answered_items >= total_items:
        bonus += 5
    if accuracy >= 0.98:
        bonus += 15
    elif accuracy >= 0.9:
        bonus += 10
    elif accuracy >= 0.8:
        bonus += 6

    if mode == "timed" and accuracy >= 0.75:
        bonus += 10
    if mode == "weakness" and accuracy >= 0.7:
        bonus += 8
    return bonus


def calculate_accuracy_percent(total_items, correct_items):
    total_items = max(0, _to_int(total_items))
    if not total_items:
        return 0
    return _clamp(round((max(0, _to_int(correct_items)) / total_items) * 100), 0, 100)


def derive_recommended_next_mode(mode, accuracy_percent=0, has_weakness=False, has_review=False):
    if accuracy_percent < 70 and has_weakness:
        return "weakness"
    if mode == "timed" and accuracy_percent < 80:
        return "mixed_review"
    if has_review:
        return "mixed_review"
    return "quick"


def _to_timestamp(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _normalize_exercise(row):
    content = _parse_json_object(row.get("content_json") or row.get("payload"))
    exercise_type = _clean_text(row.get("type") or row.get("kind")).lower()
    if exercise_type == "multiple_choice":
        exercise_type = "scramble"
    elif exercise_type == "listening":
        exercise_type = "audio_match"
    elif exercise_type == "speaking":
        exercise_type = "cloze"

    return {
        "id": row.get("id"),
        "type": exercise_type,
        "status": _clean_text(row.get("status")).lower(),
        "ordering": _to_int(row.get("ordering"), 0),
        "content_json": content,
        "updated_at": row.get("updated_at"),
        "skill_tag": _clean_text(row.get("skill_tag")).lower(),
        "cefr_level": _clean_text(row.get("cefr_level")).upper(),
        "category_id": row.get("category_id"),
        "practice_enabled": row.get("practice_enabled") is not False,
        "ranked_allowed": row.get("ranked_allowed") is True,
        "difficulty_score": row.get("difficulty_score"),
        "estimated_time_sec": max(15, _to_int(row.get("estimated_time_sec"), 90)),
        "practice_weight": max(1, _to_float(row.get("practice_weight"), 1)),
        "theme_tags": row.get("theme_tags") or [],
        "scenario_tags": row.get("scenario_tags") or [],
    }


def _normalize_progress_accuracy(progress):
    times_seen = max(0, _to_int((progress or {}).get("times_seen")))
    times_correct = max(0, _to_int((progress or {}).get("times_correct")))
    if not times_seen:
        return 1 if (progress or {}).get("is_correct") else 0
    return times_correct / times_seen


def _is_due_for_review(progress):
    if not progress:
        return False
    if progress.get("is_correct") is False:
        return True
    if _to_int(progress.get("last_quality")) <= 2:
        return True
    due_at = _to_timestamp(progress.get("next_due_at"))
    return due_at is not None and due_at <= _utc_now().timestamp()


def _get_weakness_score(progress):
    if not progress:
        return 0
    score = 0
    if progress.get("is_correct") is False:
        score += 4
    if _to_int(progress.get("last_quality")) <= 2:
        score += 3
    if _to_int(progress.get("attempts")) >= 3:
        score += 2
    if _is_due_for_review(progress):
        score += 2

    accuracy = _normalize_progress_accuracy(progress)
    if accuracy < 0.5:
        score += 3
    elif accuracy < 0.7:
        score += 1
    return score


def _sort_candidates(items, priority, by_due=False, prefer_short=False, by_weakness=False):
    def key(item):
        exercise_type = item.get("type") or ""
        try:
            type_rank = priority.index(exercise_type)
        except ValueError:
            type_rank = len(priority) + 1
        due_at = _to_timestamp((item.get("progress") or {}).get("next_due_at")) or 0
        updated_at = _to_timestamp(item.get("updated_at")) or 0
        weakness = _get_weakness_score(item.get("progress")) if by_weakness else 0
        estimated_time = _to_int(item.get("estimated_time_sec"), 90) if prefer_short else 0
        return (
            -weakness,
            type_rank,
            -_to_float(item.get("practice_weight"), 1),
            estimated_time,
            due_at if by_due else 0,
            _to_int(item.get("ordering"), 0),
            -updated_at,
            _clean_text(item.get("id")),
        )

    return sorted(items, key=key)


def _interleave_by_type(items, priority, limit):
    groups = {}
    for item in items:
        groups.setdefault(item.get("type") or "", []).append(item)

    ordered_types = []
    for exercise_type in priority:
        if exercise_type in groups:
            ordered_types.append(exercise_type)
    for exercise_type in sorted(groups.keys()):
        if exercise_type not in ordered_types:
            ordered_types.append(exercise_type)

    output = []
    while len(output) < limit:
        pushed = False
        for exercise_type in ordered_types:
            bucket = groups.get(exercise_type) or []
            if not bucket:
                continue
            output.append(bucket.pop(0))
            pushed = True
            if len(output) >= limit:
                break
        if not pushed:
            break
    return output


def _select_items(items, limit, priority, by_due=False, prefer_short=False, by_weakness=False):
    if not items or limit <= 0:
        return []
    ordered = _sort_candidates(
        items,
        priority,
        by_due=by_due,
        prefer_short=prefer_short,
        by_weakness=by_weakness,
    )
    return _interleave_by_type(ordered, priority, limit)


def _split_pool_by_progress(exercises, progress_by_exercise_id):
    attempted = []
    unseen = []
    for exercise in exercises:
        progress = progress_by_exercise_id.get(str(exercise["id"])) or None
        candidate = {**exercise, "progress": progress}
        if progress:
            attempted.append(candidate)
        else:
            unseen.append(candidate)
    return attempted, unseen


def _tag_items(items, source_reason):
    return [{**item, "source_reason": source_reason, "mode": source_reason} for item in items]


def _mix_session_items(primary_items, secondary_items, max_items):
    output = []
    primary = list(primary_items)
    secondary = list(secondary_items)
    while len(output) < max_items and (primary or secondary):
        if primary:
            output.append(primary.pop(0))
        if len(output) >= max_items:
            break
        if secondary:
            output.append(secondary.pop(0))
    return output[:max_items]


def _derive_weak_skills(attempted):
    stats = {}
    for entry in attempted:
        skill = entry.get("skill_tag") or "grammar"
        current = stats.setdefault(skill, {"skill": skill, "seen": 0, "accuracy_total": 0.0, "weakness": 0})
        current["seen"] += 1
        current["accuracy_total"] += _normalize_progress_accuracy(entry.get("progress"))
        current["weakness"] += _get_weakness_score(entry.get("progress"))

    ordered = []
    for value in stats.values():
        accuracy = value["accuracy_total"] / value["seen"] if value["seen"] else 0
        ordered.append({**value, "accuracy": accuracy})

    ordered.sort(key=lambda item: (item["accuracy"], -item["weakness"], -item["seen"]))
    return ordered


def _build_mixed_mode_items(pool, progress_by_exercise_id, new_count, review_count, new_reason="new", review_reason="review", prefer_short=False):
    attempted, unseen = _split_pool_by_progress(pool, progress_by_exercise_id)
    review_due = [entry for entry in attempted if _is_due_for_review(entry.get("progress"))]
    review_fallback = [entry for entry in attempted if entry["id"] not in {row["id"] for row in review_due}]

    selected_new = _tag_items(
        _select_items(unseen, new_count, NEW_TYPE_PRIORITY, prefer_short=prefer_short),
        new_reason,
    )
    selected_review = _tag_items(
        _select_items(review_due, review_count, REVIEW_TYPE_PRIORITY, by_due=True, prefer_short=prefer_short),
        review_reason,
    )

    if len(selected_review) < review_count:
        missing = review_count - len(selected_review)
        existing_ids = {row["id"] for row in selected_review}
        extras = _select_items(
            [entry for entry in review_fallback if entry["id"] not in existing_ids],
            missing,
            REVIEW_TYPE_PRIORITY,
            by_due=True,
            prefer_short=prefer_short,
        )
        selected_review.extend(_tag_items(extras, review_reason))

    return {
        "attempted": attempted,
        "unseen": unseen,
        "review_due_count": len(review_due),
        "items": _mix_session_items(selected_new, selected_review, new_count + review_count),
    }


def _build_timed_items(pool, progress_by_exercise_id, size):
    challenge_types = {"scramble", "cloze", "image_match"}
    challenge_pool = [
        exercise
        for exercise in pool
        if _to_int(exercise.get("estimated_time_sec"), 90) <= 180 and exercise.get("type") in challenge_types
    ]
    effective_pool = challenge_pool or pool
    attempted, unseen = _split_pool_by_progress(effective_pool, progress_by_exercise_id)

    ordered = []
    ordered.extend(
        _select_items(
            unseen,
            size,
            ["cloze", "scramble", "image_match"],
            prefer_short=True,
        )
    )
    ordered.extend(_select_items(attempted, size, REVIEW_TYPE_PRIORITY, by_due=True, prefer_short=True))

    output = []
    seen_ids = set()
    for item in ordered:
        if item["id"] in seen_ids:
            continue
        seen_ids.add(item["id"])
        output.append({**item, "source_reason": "challenge", "mode": "challenge"})
        if len(output) >= size:
            break

    return {
        "attempted": attempted,
        "unseen": unseen,
        "items": output,
        "review_due_count": len([entry for entry in attempted if _is_due_for_review(entry.get("progress"))]),
    }


def _build_weakness_items(pool, progress_by_exercise_id, size):
    attempted, unseen = _split_pool_by_progress(pool, progress_by_exercise_id)
    weak_candidates = [entry for entry in attempted if _get_weakness_score(entry.get("progress")) > 0]
    weak_skills = [entry["skill"] for entry in _derive_weak_skills(attempted)[:2]]

    items = _tag_items(
        _select_items(
            weak_candidates,
            min(size, max(1, round(size * 0.7))),
            REVIEW_TYPE_PRIORITY,
            by_due=True,
            prefer_short=True,
            by_weakness=True,
        ),
        "weakness",
    )

    if len(items) < size and weak_skills:
        existing_ids = {item["id"] for item in items}
        skill_pool = [
            entry
            for entry in pool
            if entry.get("skill_tag") in weak_skills and entry["id"] not in existing_ids
        ]
        mixed = _build_mixed_mode_items(
            skill_pool,
            progress_by_exercise_id,
            new_count=max(1, (size - len(items) + 1) // 2),
            review_count=max(0, (size - len(items)) // 2),
            new_reason="weakness",
            review_reason="weakness",
            prefer_short=True,
        )
        items.extend(mixed["items"])
        items = items[:size]

    if not items:
        items = _build_mixed_mode_items(
            pool,
            progress_by_exercise_id,
            new_count=max(1, (size + 1) // 2),
            review_count=max(0, size // 2),
            new_reason="review",
            review_reason="review",
            prefer_short=True,
        )["items"]

    return {
        "attempted": attempted,
        "unseen": unseen,
        "items": items[:size],
        "weak_skills": weak_skills,
        "review_due_count": len([entry for entry in attempted if _is_due_for_review(entry.get("progress"))]),
    }


def _build_practice_session_plan(exercises, progress_rows, mode, size):
    published = [
        exercise
        for exercise in exercises
        if exercise["type"] in EXERCISE_TYPES and exercise["status"] == "published" and exercise["practice_enabled"]
    ]
    progress_by_exercise_id = {
        str(row.get("exercise_id")): row
        for row in progress_rows
        if row.get("exercise_id")
    }
    safe_size = max(5, min(15, _to_int(size, PRACTICE_SESSION_SIZE)))

    if mode == "timed":
        return _build_timed_items(published, progress_by_exercise_id, safe_size)
    if mode == "weakness":
        return _build_weakness_items(published, progress_by_exercise_id, safe_size)

    new_count = (safe_size + 1) // 2
    review_count = safe_size // 2
    prefer_short = mode == "quick"
    if mode == "quick":
        new_count = max(1, round(safe_size * 0.6))
        review_count = max(0, safe_size - new_count)

    return _build_mixed_mode_items(
        published,
        progress_by_exercise_id,
        new_count=new_count,
        review_count=review_count,
        prefer_short=prefer_short,
    )


def _shuffle_copy(values):
    copy = list(values)
    random.shuffle(copy)
    return copy


def _unique_preserving_order(values):
    output = []
    seen = set()
    for value in values:
        key = _clean_text(value).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(value)
    return output


def _build_sentence_options(correct_sentence, target_words):
    options = [correct_sentence]
    seen = {correct_sentence}
    safe_words = [word for word in target_words if _clean_text(word)]
    if len(safe_words) < 2:
        return options

    attempts = 0
    while len(options) < 4 and attempts < 30:
        attempts += 1
        candidate_words = _shuffle_copy(safe_words)
        candidate = " ".join(candidate_words).strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        options.append(candidate)

    random.shuffle(options)
    return options


def _extract_correct_option_index(content):
    explicit_index = content.get("correct_index")
    if explicit_index is not None:
        index = _to_int(explicit_index, -1)
        return index if index >= 0 else None

    correct_vocab_id = _clean_text(content.get("correct_vocab_id"))
    if correct_vocab_id:
        for index, option in enumerate(content.get("options") or []):
            option_vocab_id = _clean_text((option or {}).get("vocab_id"))
            if option_vocab_id and option_vocab_id == correct_vocab_id:
                return index
    return None


def _build_question_step(question, context_title="", context_body="", image_url=None, audio_url=None):
    question_type = _clean_text((question or {}).get("type")).lower().replace(" ", "_")
    prompt = _clean_display_text((question or {}).get("prompt") or context_title or "Question")
    explanation = _clean_display_text((question or {}).get("explanation"))
    if question_type in {"multiple_choice", "mcq", ""}:
        options = [_clean_display_text(option) for option in (question.get("options") or []) if _clean_display_text(option)]
        correct_index = _to_int(question.get("correct_index"), -1)
        if len(options) < 2 or correct_index < 0 or correct_index >= len(options):
            return None
        return {
            "kind": "choice",
            "prompt": prompt,
            "context_title": context_title,
            "context_body": context_body,
            "options": options[:4],
            "correct_index": correct_index,
            "correct_answer_text": options[correct_index],
            "explanation": explanation,
            "image_url": image_url,
            "audio_url": audio_url,
        }

    if question_type == "true_false":
        correct_boolean = bool(question.get("correct_boolean"))
        return {
            "kind": "choice",
            "prompt": prompt,
            "context_title": context_title,
            "context_body": context_body,
            "options": ["True", "False"],
            "correct_index": 0 if correct_boolean else 1,
            "correct_answer_text": "True" if correct_boolean else "False",
            "explanation": explanation,
            "image_url": image_url,
            "audio_url": audio_url,
        }

    if question_type == "written":
        accepted_answers = [_clean_display_text(answer) for answer in (question.get("accepted_answers") or []) if _clean_display_text(answer)]
        example_answer = _clean_display_text(question.get("example_answer"))
        if example_answer and example_answer not in accepted_answers:
            accepted_answers.insert(0, example_answer)
        if not accepted_answers:
            return None
        return {
            "kind": "text",
            "prompt": prompt,
            "context_title": context_title,
            "context_body": context_body,
            "accepted_answers": accepted_answers,
            "correct_answer_text": accepted_answers[0],
            "explanation": explanation,
            "image_url": image_url,
            "audio_url": audio_url,
        }

    return None


def _to_cloze_display_text(sentence):
    if not sentence:
        return ""
    return BLANK_TOKEN_REGEX.sub("[Blank]", str(sentence))


def _extract_blank_keys(sentence):
    keys = []
    seen = set()
    for index, match in enumerate(BLANK_TOKEN_REGEX.finditer(str(sentence or "")), start=1):
        key = _clean_text(match.group(1)).lower() or f"blank_{index}"
        if key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return keys


def _adapt_scramble(exercise):
    content = exercise["content_json"]
    target_words = [_clean_display_text(word) for word in (content.get("target_words") or []) if _clean_display_text(word)]
    answer_order = [_to_int(index, -1) for index in (content.get("answer_order") or [])]
    if len(target_words) < 2 or len(answer_order) != len(target_words):
        return None

    try:
        correct_sentence = " ".join(target_words[index] for index in answer_order).strip()
    except IndexError:
        return None
    options = _build_sentence_options(correct_sentence, target_words)
    if len(options) < 2:
        return None

    return {
        "steps": [
            {
                "kind": "choice",
                "prompt": _clean_display_text(content.get("prompt_native")) or "Build the correct sentence.",
                "context_title": "Scramble",
                "context_body": "",
                "options": options,
                "correct_index": options.index(correct_sentence),
                "correct_answer_text": correct_sentence,
                "explanation": _clean_display_text(content.get("explanation")),
                "image_url": None,
                "audio_url": None,
            }
        ]
    }


def _adapt_image_match(exercise):
    content = exercise["content_json"]
    options = [
        _clean_display_text((option or {}).get("label"))
        for option in (content.get("options") or [])
        if _clean_display_text((option or {}).get("label"))
    ]
    correct_index = _extract_correct_option_index(content)
    if len(options) < 2 or correct_index is None or correct_index >= len(options):
        return None

    return {
        "steps": [
            {
                "kind": "choice",
                "prompt": _clean_display_text(content.get("question_native")) or "Choose the correct option.",
                "context_title": "Image Match",
                "context_body": "Look at the image and choose the right answer.",
                "options": options[:4],
                "correct_index": correct_index,
                "correct_answer_text": options[correct_index],
                "explanation": _clean_display_text(content.get("explanation")),
                "image_url": content.get("image_url"),
                "audio_url": None,
            }
        ]
    }


def _adapt_pairs(exercise):
    content = exercise["content_json"]
    pairs = [
        {
            "native": _clean_display_text((pair or {}).get("native")),
            "target": _clean_display_text((pair or {}).get("target")),
        }
        for pair in (content.get("pairs") or [])
    ]
    pairs = [pair for pair in pairs if pair["native"] and pair["target"]]
    if len(pairs) < 2:
        return None

    targets = [pair["target"] for pair in pairs]
    steps = []
    for pair in pairs[:3]:
        distractors = [target for target in targets if target != pair["target"]]
        selected = [pair["target"]]
        if distractors:
            selected.extend(random.sample(distractors, min(3, len(distractors))))
        selected = list(dict.fromkeys(selected))
        random.shuffle(selected)
        steps.append(
            {
                "kind": "choice",
                "prompt": f"Choose the English match for: {pair['native']}",
                "context_title": _clean_display_text(content.get("pairs_title")) or "Pairs",
                "context_body": "Match the term with the correct translation.",
                "options": selected,
                "correct_index": selected.index(pair["target"]),
                "correct_answer_text": pair["target"],
                "explanation": _clean_display_text(content.get("explanation")),
                "image_url": None,
                "audio_url": None,
            }
        )
    return {"steps": steps}


def _adapt_cloze(exercise):
    content = exercise["content_json"]
    sentence = _clean_display_text(content.get("sentence"))
    blank_keys = _extract_blank_keys(sentence)
    blanks = content.get("blanks") or []
    options_pool = content.get("options_pool") or []
    options_by_id = {
        _clean_text((option or {}).get("id")).lower(): _clean_display_text((option or {}).get("text"))
        for option in options_pool
        if _clean_text((option or {}).get("id")) and _clean_text((option or {}).get("text"))
    }
    explanations = content.get("explanations") or {}
    steps = []

    if blanks and 1 < len(blanks) <= 4:
        blank_entries = []
        for index, blank in enumerate(blanks, start=1):
            blank_key = _clean_text(blank.get("id") or blank.get("key")).lower() or (
                blank_keys[index - 1] if index - 1 < len(blank_keys) else f"blank_{index}"
            )
            correct_option_id = _clean_text(blank.get("correct_option_id")).lower()
            correct_text = _clean_display_text(options_by_id.get(correct_option_id)) or ""
            if not correct_text:
                continue
            blank_entries.append(
                {
                    "key": blank_key,
                    "correct_text": correct_text,
                }
            )

        if len(blank_entries) == len(blanks):
            correct_parts = [entry["correct_text"] for entry in blank_entries]
            correct_combo = " / ".join(correct_parts)
            pool_values = _unique_preserving_order(
                [_clean_display_text(value) for value in options_by_id.values() if _clean_display_text(value)]
            )
            combo_options = [correct_combo]

            for blank_index, entry in enumerate(blank_entries):
                distractors = [value for value in pool_values if value != entry["correct_text"]]
                for distractor in distractors:
                    candidate_parts = list(correct_parts)
                    candidate_parts[blank_index] = distractor
                    combo_value = " / ".join(candidate_parts)
                    if combo_value not in combo_options:
                        combo_options.append(combo_value)
                    if len(combo_options) >= 4:
                        break
                if len(combo_options) >= 4:
                    break

            if len(combo_options) >= 2:
                shuffled_options = combo_options[:]
                random.shuffle(shuffled_options)
                return {
                    "steps": [
                        {
                            "kind": "choice",
                            "prompt": "Fill in all blanks.",
                            "context_title": "Fill in the blanks",
                            "context_body": _to_cloze_display_text(sentence),
                            "options": shuffled_options,
                            "correct_index": shuffled_options.index(correct_combo),
                            "correct_answer_text": correct_combo,
                            "explanation": _clean_display_text(content.get("explanation")),
                            "image_url": None,
                            "audio_url": None,
                        }
                    ]
                }

    if blanks and 1 < len(blanks) <= 5:
        multi_blanks = []
        combined_answers = []
        for index, blank in enumerate(blanks, start=1):
            blank_key = _clean_text(blank.get("id") or blank.get("key")).lower() or (
                blank_keys[index - 1] if index - 1 < len(blank_keys) else f"blank_{index}"
            )
            correct_option_id = _clean_text(blank.get("correct_option_id")).lower()
            correct_text = _clean_display_text(options_by_id.get(correct_option_id)) or ""
            if not correct_text:
                continue
            multi_blanks.append(
                {
                    "key": blank_key,
                    "label": f"Blank {index}",
                    "accepted_answers": [correct_text],
                    "correct_answer_text": correct_text,
                }
            )
            combined_answers.append(f"{index}) {correct_text}")

        if len(multi_blanks) == len(blanks):
            return {
                "steps": [
                    {
                        "kind": "multi_text",
                        "prompt": "Fill in all blanks.",
                        "context_title": "Fill in the blanks",
                        "context_body": _to_cloze_display_text(sentence),
                        "blanks": multi_blanks,
                        "correct_answer_text": " | ".join(combined_answers),
                        "explanation": _clean_display_text(content.get("explanation")),
                        "image_url": None,
                        "audio_url": None,
                    }
                ]
            }

    if blanks:
        for index, blank in enumerate(blanks, start=1):
            blank_key = _clean_text(blank.get("id") or blank.get("key")).lower() or (blank_keys[index - 1] if index - 1 < len(blank_keys) else f"blank_{index}")
            correct_option_id = _clean_text(blank.get("correct_option_id")).lower()
            correct_text = _clean_display_text(options_by_id.get(correct_option_id)) or ""
            if not correct_text:
                continue

            pool_values = [_clean_display_text(value) for value in options_by_id.values() if _clean_display_text(value)]
            prompt = f"Fill blank {index} in the sentence."
            display_text = _to_cloze_display_text(sentence)
            explanation = _clean_display_text(explanations.get(blank_key) or content.get("explanation"))

            if len(pool_values) >= 2:
                selected = [correct_text]
                distractors = [value for value in pool_values if value != correct_text]
                if distractors:
                    selected.extend(random.sample(distractors, min(3, len(distractors))))
                selected = list(dict.fromkeys(selected))
                random.shuffle(selected)
                steps.append(
                    {
                        "kind": "choice",
                        "prompt": prompt,
                        "context_title": "Fill in the blanks",
                        "context_body": display_text,
                        "options": selected,
                        "correct_index": selected.index(correct_text),
                        "correct_answer_text": correct_text,
                        "explanation": explanation,
                        "image_url": None,
                        "audio_url": None,
                    }
                )
            else:
                steps.append(
                    {
                        "kind": "text",
                        "prompt": prompt,
                        "context_title": "Fill in the blanks",
                        "context_body": display_text,
                        "accepted_answers": [correct_text],
                        "correct_answer_text": correct_text,
                        "explanation": explanation,
                        "image_url": None,
                        "audio_url": None,
                    }
                )

    if steps:
        return {"steps": steps}

    correct_text = _clean_display_text(content.get("answer") or content.get("correct"))
    if not correct_text:
        return None
    return {
        "steps": [
            {
                "kind": "text",
                "prompt": "Complete the sentence.",
                "context_title": "Fill in the blanks",
                "context_body": _to_cloze_display_text(sentence),
                "accepted_answers": [correct_text],
                "correct_answer_text": correct_text,
                "explanation": _clean_display_text(content.get("explanation")),
                "image_url": None,
                "audio_url": None,
            }
        ]
    }


def _adapt_audio_match(exercise):
    content = exercise["content_json"]
    audio_url = content.get("audio_url") or content.get("youtube_url")
    title = _clean_display_text(content.get("listening_title")) or "Listening Exercise"
    body = _clean_display_text(content.get("prompt_native")) or "Listen and answer."
    questions = content.get("questions") or []
    steps = []

    for question in questions:
        step = _build_question_step(
            question,
            context_title=title,
            context_body=body,
            audio_url=audio_url,
        )
        if step:
            steps.append(step)

    if steps:
        return {"steps": steps}

    options = [_clean_display_text(option) for option in (content.get("options") or []) if _clean_display_text(option)]
    correct_index = _to_int(content.get("correct_index"), -1)
    if len(options) >= 2 and 0 <= correct_index < len(options):
        return {
            "steps": [
                {
                    "kind": "choice",
                    "prompt": body or "Choose the correct answer.",
                    "context_title": title,
                    "context_body": "Listen to the audio before answering.",
                    "options": options[:4],
                    "correct_index": correct_index,
                    "correct_answer_text": options[correct_index],
                    "explanation": _clean_display_text(content.get("explanation")),
                    "image_url": None,
                    "audio_url": audio_url,
                }
            ]
        }

    text_target = _clean_display_text(content.get("text_target"))
    if text_target:
        return {
            "steps": [
                {
                    "kind": "text",
                    "prompt": body or "Write what you hear.",
                    "context_title": title,
                    "context_body": "Listen and type the answer.",
                    "accepted_answers": [text_target],
                    "correct_answer_text": text_target,
                    "explanation": _clean_display_text(content.get("explanation")),
                    "image_url": None,
                    "audio_url": audio_url,
                }
            ]
        }
    return None


def _adapt_reading_exercise(exercise):
    content = exercise["content_json"]
    title = _clean_display_text(content.get("title") or content.get("reading_title")) or "Reading Exercise"
    text = _clean_display_text(content.get("text") or content.get("reading_text"))
    questions = content.get("questions") or []
    if not text or not questions:
        return None

    body = text if len(text) <= 3200 else f"{text[:3200].rstrip()}..."
    steps = []
    for question in questions:
        step = _build_question_step(
            question,
            context_title=title,
            context_body=body,
            image_url=content.get("image_url"),
        )
        if step:
            steps.append(step)
    return {"steps": steps} if steps else None


def adapt_exercise_for_discord(exercise):
    exercise_type = exercise.get("type")
    if exercise_type == "scramble":
        adapted = _adapt_scramble(exercise)
    elif exercise_type == "image_match":
        adapted = _adapt_image_match(exercise)
    elif exercise_type == "pairs":
        adapted = _adapt_pairs(exercise)
    elif exercise_type == "cloze":
        adapted = _adapt_cloze(exercise)
    elif exercise_type == "audio_match":
        adapted = _adapt_audio_match(exercise)
    elif exercise_type == "reading_exercise":
        adapted = _adapt_reading_exercise(exercise)
    else:
        adapted = None

    if not adapted or not adapted.get("steps"):
        return None

    return {
        **exercise,
        **adapted,
    }


def _filter_supported_exercises(rows):
    supported = []
    for row in rows:
        normalized = _normalize_exercise(row)
        adapted = adapt_exercise_for_discord(normalized)
        if adapted:
            supported.append(adapted)
    return supported


def build_discord_practice_session(student, mode=None, session_size=None):
    mode = _normalize_mode(mode, "mixed_review")
    session_size = max(5, min(15, _to_int(session_size, PRACTICE_SESSION_SIZE)))
    cefr_level = _normalize_student_cefr_level(student.get("course_level"))

    exercise_rows = list_published_practice_exercises(cefr_level=cefr_level)
    exercises = _filter_supported_exercises(exercise_rows)
    if not exercises and cefr_level:
        exercises = _filter_supported_exercises(list_published_practice_exercises())
    if not exercises:
        return None

    progress_rows = list_global_user_progress(student["id"])
    plan = _build_practice_session_plan(exercises, progress_rows, mode, session_size)
    selected_items = plan.get("items") or []
    if not selected_items:
        return None

    abandon_active_practice_sessions(student["id"], source_context="discord_practice")
    time_limit_sec = PRACTICE_TIMED_SECONDS if mode == "timed" else None
    session_row = create_practice_session(
        student["id"],
        mode=mode,
        session_size=len(selected_items),
        total_items=len(selected_items),
        source_context="discord_practice",
        filters={"cefr_level": cefr_level} if cefr_level else {},
        time_limit_sec=time_limit_sec,
    )
    if not session_row:
        return None

    persisted_items = create_practice_session_items(session_row["id"], selected_items)
    for index, item in enumerate(selected_items):
        if index < len(persisted_items):
            item["practice_item_id"] = persisted_items[index]["id"]
    if any(not item.get("practice_item_id") for item in selected_items):
        update_practice_session(
            session_row["id"],
            {
                "status": "abandoned",
                "updated_at": _utc_now_iso(),
            },
        )
        return None

    gamification = ensure_gamification_profile(student["id"], legacy_xp_total=_to_int(student.get("xp_total")))
    return {
        "id": session_row["id"],
        "mode": mode,
        "label": PRACTICE_MODES[mode],
        "time_limit_sec": time_limit_sec,
        "items": selected_items,
        "gamification": gamification,
    }


def evaluate_step_answer(step, answer_payload):
    kind = step.get("kind")
    if kind == "choice":
        selected_index = _to_int((answer_payload or {}).get("selected_index"), -1)
        is_correct = selected_index == _to_int(step.get("correct_index"), -1)
        return {
            "is_correct": is_correct,
            "submitted_value": selected_index,
            "correct_answer_text": step.get("correct_answer_text") or "",
        }

    if kind == "text":
        submitted_text = _clean_text((answer_payload or {}).get("text"))
        normalized_submitted = _normalize_answer_text(submitted_text)
        accepted_answers = [
            _normalize_answer_text(value)
            for value in (step.get("accepted_answers") or [])
            if _clean_text(value)
        ]
        is_correct = bool(normalized_submitted) and normalized_submitted in accepted_answers
        return {
            "is_correct": is_correct,
            "submitted_value": submitted_text,
            "correct_answer_text": step.get("correct_answer_text") or "",
        }

    if kind == "multi_text":
        submitted_answers = (answer_payload or {}).get("answers") or {}
        normalized_snapshot = {}
        is_correct = True
        combined_answers = []

        for index, blank in enumerate(step.get("blanks") or [], start=1):
            key = _clean_text(blank.get("key")).lower() or f"blank_{index}"
            submitted_text = _clean_text(submitted_answers.get(key))
            normalized_submitted = _normalize_answer_text(submitted_text)
            accepted_answers = [
                _normalize_answer_text(value)
                for value in (blank.get("accepted_answers") or [])
                if _clean_text(value)
            ]
            blank_correct = bool(normalized_submitted) and normalized_submitted in accepted_answers
            normalized_snapshot[key] = {
                "submitted_value": submitted_text,
                "is_correct": blank_correct,
            }
            if not blank_correct:
                is_correct = False
            combined_answers.append(f"{index}) {blank.get('correct_answer_text') or ''}")

        return {
            "is_correct": is_correct,
            "submitted_value": normalized_snapshot,
            "correct_answer_text": " | ".join(combined_answers),
        }

    return {
        "is_correct": False,
        "submitted_value": None,
        "correct_answer_text": step.get("correct_answer_text") or "",
    }


def apply_practice_item_result(student_id, exercise_id, practice_item_id, mode, is_correct, answer_snapshot, attempts=1, legacy_xp_total=0):
    existing = get_global_user_progress(student_id, exercise_id)
    sr_update = _compute_spaced_repetition_update(
        previous_interval=(existing or {}).get("interval_days") or 1,
        previous_ease_factor=(existing or {}).get("ease_factor") or 2.5,
        is_correct=is_correct,
        attempts=attempts,
    )

    progress_payload = {
        "user_id": str(student_id),
        "exercise_id": str(exercise_id),
        "is_correct": bool(is_correct),
        "attempts": max(1, _to_int(attempts, 1)),
        "last_practiced": _utc_now_iso(),
        "interval_days": sr_update["interval_days"],
        "ease_factor": sr_update["ease_factor"],
        "next_due_at": sr_update["next_due_at"],
        "last_quality": sr_update["quality"],
        "times_seen": _to_int((existing or {}).get("times_seen")) + 1,
        "times_correct": _to_int((existing or {}).get("times_correct")) + (1 if is_correct else 0),
        "streak_count": (_to_int((existing or {}).get("streak_count")) + 1) if is_correct else 0,
        "updated_at": _utc_now_iso(),
    }
    save_global_user_progress(student_id, exercise_id, progress_payload)

    xp_gain = calculate_practice_item_xp(is_correct, attempts=attempts, mode=mode)
    update_practice_session_item(
        practice_item_id,
        {
            "attempts": max(1, _to_int(attempts, 1)),
            "is_correct": bool(is_correct),
            "xp_earned": xp_gain,
            "answer_snapshot": answer_snapshot,
            "answered_at": _utc_now_iso(),
            "updated_at": _utc_now_iso(),
        },
    )

    gamification = apply_gamification_delta(
        student_id,
        legacy_xp_total=legacy_xp_total,
        xp_delta=xp_gain,
        practice_xp_delta=xp_gain,
    )

    return {
        "xp_gain": xp_gain,
        "gamification": gamification,
        "sr_update": sr_update,
    }


def complete_discord_practice_session(student, session_id, mode, items, results, started_at, legacy_xp_total=0):
    total_items = len(items)
    answered_items = len(results)
    correct_items = sum(1 for result in results if result.get("is_correct"))
    item_xp = sum(max(0, _to_int(result.get("xp_gain"))) for result in results)
    accuracy_percent = calculate_accuracy_percent(total_items, correct_items)
    xp_bonus = calculate_session_bonus(mode, total_items, correct_items, answered_items)
    source_reasons = {item.get("source_reason") for item in items}
    has_weakness = "weakness" in source_reasons
    has_review = "review" in source_reasons
    recommended_next_mode = derive_recommended_next_mode(
        mode,
        accuracy_percent=accuracy_percent,
        has_weakness=has_weakness,
        has_review=has_review,
    )
    listening_items_completed = sum(
        1
        for item, result in zip(items, results)
        if result.get("answered")
        and (
            item.get("skill_tag") == "listening"
            or item.get("type") == "audio_match"
        )
    )
    time_spent_sec = max(0, round((_utc_now() - started_at).total_seconds()))

    update_practice_session(
        session_id,
        {
            "status": "completed",
            "answered_items": answered_items,
            "correct_items": correct_items,
            "accuracy_rate": accuracy_percent,
            "xp_earned": item_xp + xp_bonus,
            "time_spent_sec": time_spent_sec,
            "recommended_next_mode": recommended_next_mode,
            "completed_at": _utc_now_iso(),
            "updated_at": _utc_now_iso(),
        },
    )

    gamification = apply_gamification_delta(
        student["id"],
        legacy_xp_total=legacy_xp_total,
        xp_delta=xp_bonus,
        practice_xp_delta=xp_bonus,
        stats={
            "practice_sessions_completed": 1,
            "perfect_sessions": 1 if accuracy_percent >= 98 else 0,
            "timed_challenges_completed": 1 if mode == "timed" else 0,
        },
    )

    competition = record_competition_activity(
        student["id"],
        legacy_xp_total=gamification["lifetime_xp"],
        activity={
            "source": "practice",
            "mode": mode,
            "xp_earned": item_xp + xp_bonus,
            "total_items": total_items,
            "answered_items": answered_items,
            "correct_items": correct_items,
            "accuracy_percent": accuracy_percent,
            "listening_items_completed": listening_items_completed,
            "time_spent_sec": time_spent_sec,
        },
    )

    latest_student = get_student_by_id(student["id"]) or student
    latest_gamification = competition.get("gamification") or ensure_gamification_profile(
        student["id"],
        legacy_xp_total=max(gamification["lifetime_xp"], _to_int(latest_student.get("xp_total"))),
    )

    return {
        "session_id": session_id,
        "mode": mode,
        "label": PRACTICE_MODES.get(mode, "Practice"),
        "total_items": total_items,
        "answered_items": answered_items,
        "correct_items": correct_items,
        "accuracy_percent": accuracy_percent,
        "xp_earned": item_xp + xp_bonus,
        "xp_bonus": xp_bonus,
        "recommended_next_mode": recommended_next_mode,
        "time_spent_sec": time_spent_sec,
        "weekly_points_earned": _to_int((competition.get("contribution") or {}).get("weekly_points")),
        "quest_reward_xp": _to_int(competition.get("quest_reward_xp")),
        "gamification": latest_gamification,
    }
