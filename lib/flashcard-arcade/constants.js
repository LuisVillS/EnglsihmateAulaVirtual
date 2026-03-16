export const FLASHCARD_GAME_MODES = {
  STUDY: "study",
  SPEED_MATCH: "speed_match",
  WRITING_SPRINT: "writing_sprint",
  MEMORY_GRID: "memory_grid",
  SURVIVAL: "survival",
};

export const FLASHCARD_GAME_MODE_LABELS = {
  [FLASHCARD_GAME_MODES.STUDY]: "Study Mode",
  [FLASHCARD_GAME_MODES.SPEED_MATCH]: "Speed Match",
  [FLASHCARD_GAME_MODES.WRITING_SPRINT]: "Writing Sprint",
  [FLASHCARD_GAME_MODES.MEMORY_GRID]: "Memory Grid",
  [FLASHCARD_GAME_MODES.SURVIVAL]: "Survival Mode",
};

export const FLASHCARD_DECK_SOURCE_TYPES = {
  SYSTEM: "system",
  SESSION: "session",
  TEMPLATE_SESSION: "template_session",
  THEME: "theme",
  WEAKNESS: "weakness",
};

export const FLASHCARD_DECK_KEY_PREFIXES = {
  SESSION: "session",
  SAVED: "deck",
  WEAKNESS: "weakness",
};

export function buildSessionDeckKey(sessionId) {
  return `${FLASHCARD_DECK_KEY_PREFIXES.SESSION}:${String(sessionId || "").trim()}`;
}

export function buildSavedDeckKey(deckId) {
  return `${FLASHCARD_DECK_KEY_PREFIXES.SAVED}:${String(deckId || "").trim()}`;
}

export function buildWeaknessDeckKey(scope = "assigned") {
  return `${FLASHCARD_DECK_KEY_PREFIXES.WEAKNESS}:${String(scope || "assigned").trim()}`;
}

export function parseDeckKey(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) {
    return {
      raw: "",
      kind: "",
      identifier: "",
    };
  }

  const [kind, ...rest] = value.split(":");
  return {
    raw: value,
    kind: kind || "",
    identifier: rest.join(":").trim(),
  };
}

export function normalizeFlashcardGameMode(input) {
  const value = String(input || "").trim().toLowerCase();
  const modes = Object.values(FLASHCARD_GAME_MODES);
  return modes.includes(value) ? value : FLASHCARD_GAME_MODES.STUDY;
}

