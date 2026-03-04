import { toClozeDisplayText } from "@/lib/cloze-blanks";

export const EXERCISE_LIBRARY_SKILLS = [
  { value: "grammar", label: "Grammar" },
  { value: "listening", label: "Listening" },
  { value: "reading", label: "Reading" },
  { value: "vocabulary", label: "Vocabulary" },
];

export const EXERCISE_LIBRARY_LEVELS = [
  { value: "A1", label: "A1" },
  { value: "A2", label: "A2" },
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
  { value: "C1", label: "C1" },
];

export const EXERCISE_LIBRARY_SKILL_VALUES = EXERCISE_LIBRARY_SKILLS.map((option) => option.value);
export const EXERCISE_LIBRARY_LEVEL_VALUES = EXERCISE_LIBRARY_LEVELS.map((option) => option.value);

const EXERCISE_TYPE_LABELS = {
  scramble: "Scrambled Sentence",
  audio_match: "Listening Exercise",
  reading_exercise: "Reading Exercise",
  image_match: "Image-Word Association",
  pairs: "Pairs Game",
  cloze: "Fill in the blanks",
};

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeExerciseLibrarySkill(value, fallback = "grammar") {
  const raw = normalizeWhitespace(value).toLowerCase();
  if (EXERCISE_LIBRARY_SKILL_VALUES.includes(raw)) return raw;
  return fallback;
}

export function normalizeExerciseLibraryLevel(value, fallback = "A1") {
  const raw = normalizeWhitespace(value).toUpperCase();
  if (EXERCISE_LIBRARY_LEVEL_VALUES.includes(raw)) return raw;
  return fallback;
}

export function normalizeExerciseLibraryTitle(value) {
  return normalizeWhitespace(value) || "Untitled exercise";
}

export function getExerciseDisplayTitle(type, contentJson, fallbackTitle = "") {
  const normalizedType = normalizeWhitespace(type).toLowerCase();
  const content = contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)
    ? contentJson
    : {};

  if (normalizedType === "cloze") {
    return normalizeExerciseLibraryTitle(toClozeDisplayText(content.sentence || "") || fallbackTitle);
  }

  if (normalizedType === "scramble") {
    const targetWords = Array.isArray(content.target_words)
      ? content.target_words.map((value) => normalizeWhitespace(value)).filter(Boolean)
      : [];
    const answerOrder = Array.isArray(content.answer_order)
      ? content.answer_order.map((value) => Number.parseInt(String(value ?? ""), 10))
      : [];
    const orderedWords = answerOrder.length === targetWords.length
      ? answerOrder.map((index) => targetWords[index]).filter(Boolean)
      : targetWords;
    return normalizeExerciseLibraryTitle(orderedWords.join(" ") || fallbackTitle);
  }

  if (normalizedType === "reading_exercise") {
    return normalizeExerciseLibraryTitle(
      content.reading_title || content.title || fallbackTitle
    );
  }

  if (normalizedType === "audio_match") {
    return normalizeExerciseLibraryTitle(
      content.listening_title || content.title || fallbackTitle
    );
  }

  if (normalizedType === "image_match") {
    const options = Array.isArray(content.options) ? content.options : [];
    const correctByVocab = String(content.correct_vocab_id || "").trim();
    const correctIndex = Number.parseInt(String(content.correct_index ?? ""), 10);
    let selectedOption = null;
    if (correctByVocab) {
      selectedOption = options.find((option) => String(option?.vocab_id || "").trim() === correctByVocab) || null;
    }
    if (!selectedOption && Number.isFinite(correctIndex) && correctIndex >= 0 && correctIndex < options.length) {
      selectedOption = options[correctIndex] || null;
    }
    return normalizeExerciseLibraryTitle(selectedOption?.label || fallbackTitle);
  }

  if (normalizedType === "pairs") {
    return normalizeExerciseLibraryTitle(
      content.pairs_title || content.title || fallbackTitle
    );
  }

  return normalizeExerciseLibraryTitle(fallbackTitle);
}

export function normalizeExerciseCategoryName(value) {
  return normalizeWhitespace(value);
}

export function getExerciseCategoryLabel(value) {
  return normalizeExerciseCategoryName(value) || "Sin categoria";
}

export function getExerciseLibraryCategoryKey(entry) {
  const id = String(entry?.categoryId || entry?.category_id || entry?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }
  const name = normalizeExerciseCategoryName(entry?.categoryName || entry?.category_name || entry?.name || "");
  if (!name) {
    return "uncategorized";
  }
  return `name:${name.toLowerCase()}`;
}

export function getExerciseTypeLabel(type) {
  const raw = normalizeWhitespace(type).toLowerCase();
  return EXERCISE_TYPE_LABELS[raw] || "Exercise";
}

export function mapExerciseCategoryRow(row) {
  return {
    id: String(row?.id || "").trim(),
    name: normalizeExerciseCategoryName(row?.name),
    skill: normalizeExerciseLibrarySkill(row?.skill, "grammar"),
    cefrLevel: normalizeExerciseLibraryLevel(row?.cefr_level || row?.cefrLevel, "A1"),
  };
}

export function mapExerciseLibraryRow(row) {
  const categorySource = row?.category || row?.exercise_categories || row?.exercise_category || null;
  const normalizedCategory = categorySource ? mapExerciseCategoryRow(categorySource) : null;
  const contentJson =
    row?.content_json && typeof row.content_json === "object" && !Array.isArray(row.content_json)
      ? row.content_json
      : {};
  const storedTitle = normalizeExerciseLibraryTitle(row?.title || row?.prompt);
  const displayTitle = getExerciseDisplayTitle(row?.type, contentJson, storedTitle);

  return {
    id: String(row?.id || "").trim(),
    rawTitle: storedTitle,
    title: displayTitle,
    displayTitle,
    prompt: normalizeWhitespace(row?.prompt),
    skill: normalizeExerciseLibrarySkill(row?.skill_tag || row?.skill, "grammar"),
    cefrLevel: normalizeExerciseLibraryLevel(row?.cefr_level || row?.cefrLevel, "A1"),
    categoryId: String(row?.category_id || row?.categoryId || normalizedCategory?.id || "").trim(),
    categoryName: normalizeExerciseCategoryName(
      row?.category_name || row?.categoryName || normalizedCategory?.name || ""
    ),
    type: normalizeWhitespace(row?.type).toLowerCase(),
    typeLabel: getExerciseTypeLabel(row?.type),
    status: normalizeWhitespace(row?.status || "published").toLowerCase() || "published",
    contentJson,
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
  };
}

export function matchesExerciseLibrarySearch(exercise, query) {
  const needle = normalizeWhitespace(query).toLowerCase();
  if (!needle) return true;

  return [
    exercise?.title,
    exercise?.prompt,
    exercise?.categoryName,
    exercise?.skill,
    exercise?.cefrLevel,
    exercise?.typeLabel,
  ]
    .map((value) => normalizeWhitespace(value).toLowerCase())
    .some((value) => value.includes(needle));
}

function getSkillOrder(value) {
  const index = EXERCISE_LIBRARY_SKILL_VALUES.indexOf(normalizeExerciseLibrarySkill(value, "grammar"));
  return index >= 0 ? index : EXERCISE_LIBRARY_SKILL_VALUES.length;
}

function getLevelOrder(value) {
  const index = EXERCISE_LIBRARY_LEVEL_VALUES.indexOf(normalizeExerciseLibraryLevel(value, "A1"));
  return index >= 0 ? index : EXERCISE_LIBRARY_LEVEL_VALUES.length;
}

export function sortExerciseLibrary(list = []) {
  return [...(Array.isArray(list) ? list : [])].sort((left, right) => {
    const skillCompare = getSkillOrder(left?.skill) - getSkillOrder(right?.skill);
    if (skillCompare !== 0) return skillCompare;

    const levelCompare = getLevelOrder(left?.cefrLevel) - getLevelOrder(right?.cefrLevel);
    if (levelCompare !== 0) return levelCompare;

    const categoryCompare = getExerciseCategoryLabel(left?.categoryName).localeCompare(
      getExerciseCategoryLabel(right?.categoryName),
      "en",
      { sensitivity: "base" }
    );
    if (categoryCompare !== 0) return categoryCompare;

    return normalizeExerciseLibraryTitle(left?.title).localeCompare(
      normalizeExerciseLibraryTitle(right?.title),
      "en",
      { sensitivity: "base" }
    );
  });
}

export function buildExerciseLibrarySummary(exercise) {
  const base = normalizeWhitespace(exercise?.prompt);
  if (base) return base;

  const content = exercise?.contentJson || {};
  return normalizeWhitespace(
    content.title ||
      content.prompt_native ||
      content.question_native ||
      content.sentence ||
      content.text ||
      content.text_target
  );
}
