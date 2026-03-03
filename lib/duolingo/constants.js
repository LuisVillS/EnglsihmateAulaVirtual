export const EXERCISE_TYPES = {
  SCRAMBLE: "scramble",
  AUDIO_MATCH: "audio_match",
  READING_EXERCISE: "reading_exercise",
  IMAGE_MATCH: "image_match",
  PAIRS: "pairs",
  CLOZE: "cloze",
};

export const EXERCISE_TYPE_VALUES = Object.values(EXERCISE_TYPES);

export const EXERCISE_SKILL_TAGS = {
  GRAMMAR: "grammar",
  READING: "reading",
  LISTENING: "listening",
  VOCABULARY: "vocabulary",
};

export const EXERCISE_SKILL_TAG_VALUES = Object.values(EXERCISE_SKILL_TAGS);

export const CONTENT_STATUSES = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
  DELETED: "deleted",
};

export const CONTENT_STATUS_VALUES = Object.values(CONTENT_STATUSES);

export const AUDIO_MODES = {
  DICTATION: "dictation",
  TRANSLATION: "translation",
};

export const AUDIO_MODE_VALUES = Object.values(AUDIO_MODES);

export const LEGACY_KIND_BY_TYPE = {
  [EXERCISE_TYPES.SCRAMBLE]: "multiple_choice",
  [EXERCISE_TYPES.AUDIO_MATCH]: "listening",
  [EXERCISE_TYPES.READING_EXERCISE]: "multiple_choice",
  [EXERCISE_TYPES.IMAGE_MATCH]: "multiple_choice",
  [EXERCISE_TYPES.PAIRS]: "multiple_choice",
  [EXERCISE_TYPES.CLOZE]: "speaking",
};

export const TYPE_BY_LEGACY_KIND = {
  listening: EXERCISE_TYPES.AUDIO_MATCH,
  speaking: EXERCISE_TYPES.CLOZE,
  multiple_choice: EXERCISE_TYPES.SCRAMBLE,
};

export const DEFAULT_SESSION_SIZE = 10;
export const DEFAULT_NEW_ITEMS = 5;
export const DEFAULT_REVIEW_ITEMS = 5;

export const NEW_TYPE_PRIORITY = [
  EXERCISE_TYPES.IMAGE_MATCH,
  EXERCISE_TYPES.READING_EXERCISE,
  EXERCISE_TYPES.CLOZE,
  EXERCISE_TYPES.READING_EXERCISE,
  EXERCISE_TYPES.SCRAMBLE,
  EXERCISE_TYPES.AUDIO_MATCH,
  EXERCISE_TYPES.PAIRS,
];

export const REVIEW_TYPE_PRIORITY = [
  EXERCISE_TYPES.SCRAMBLE,
  EXERCISE_TYPES.AUDIO_MATCH,
  EXERCISE_TYPES.CLOZE,
  EXERCISE_TYPES.IMAGE_MATCH,
  EXERCISE_TYPES.PAIRS,
];
