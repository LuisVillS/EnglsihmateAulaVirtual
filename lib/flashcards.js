export function normalizeFlashcardAcceptedAnswers(input) {
  const source = Array.isArray(input)
    ? input
    : String(input || "")
      .split(/[\r\n,|]+/);

  return Array.from(
    new Set(
      source
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeElevenLabsConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input;
}

export function mapLibraryFlashcardRow(row) {
  return {
    id: String(row?.id || "").trim(),
    flashcardId: String(row?.id || "").trim(),
    word: String(row?.word || "").trim(),
    meaning: String(row?.meaning || "").trim(),
    image: String(row?.image_url || row?.image || "").trim(),
    acceptedAnswers: normalizeFlashcardAcceptedAnswers(row?.accepted_answers ?? row?.acceptedAnswers),
    audioUrl: String(row?.audio_url || row?.audioUrl || "").trim(),
    audioR2Key: String(row?.audio_r2_key || row?.audioR2Key || "").trim(),
    audioProvider: String(row?.audio_provider || row?.audioProvider || "elevenlabs").trim() || "elevenlabs",
    voiceId: String(row?.voice_id || row?.voiceId || "").trim(),
    elevenLabsConfig: normalizeElevenLabsConfig(row?.elevenlabs_config ?? row?.elevenLabsConfig),
  };
}

export function buildFlashcardLibraryMap(rows = []) {
  return new Map(
    (Array.isArray(rows) ? rows : [])
      .map((row) => mapLibraryFlashcardRow(row))
      .filter((row) => row.id)
      .map((row) => [row.id, row])
  );
}

export function resolveAssignedFlashcardRow(row, flashcardsById = new Map(), fallbackOrder = 1) {
  const assignmentId = String(row?.id || "").trim();
  const flashcardId = String(row?.flashcard_id || row?.flashcardId || "").trim();
  const libraryCard = flashcardId ? flashcardsById.get(flashcardId) || null : null;
  const source = libraryCard || row || {};

  return {
    id: assignmentId,
    legacyId: !flashcardId ? assignmentId : "",
    flashcardId,
    word: String(source?.word || "").trim(),
    meaning: String(source?.meaning || "").trim(),
    image: String(source?.image_url || source?.image || "").trim(),
    order: Number(row?.card_order || row?.order || fallbackOrder) || fallbackOrder,
    acceptedAnswers: libraryCard
      ? normalizeFlashcardAcceptedAnswers(libraryCard.acceptedAnswers)
      : normalizeFlashcardAcceptedAnswers(row?.accepted_answers ?? row?.acceptedAnswers),
    audioUrl: String(source?.audio_url || source?.audioUrl || "").trim(),
    audioR2Key: String(source?.audio_r2_key || source?.audioR2Key || "").trim(),
    audioProvider: String(source?.audio_provider || source?.audioProvider || "elevenlabs").trim() || "elevenlabs",
    voiceId: String(source?.voice_id || source?.voiceId || "").trim(),
    elevenLabsConfig: normalizeElevenLabsConfig(source?.elevenlabs_config ?? source?.elevenLabsConfig),
  };
}

export function parseFlashcardsBatch(rawBatch) {
  let rows = [];
  try {
    const parsed = JSON.parse(String(rawBatch || "[]"));
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error("Formato invalido de flashcards (batchJson).");
  }

  return rows.map((row, index) => ({
    id: String(row?.id || "").trim(),
    legacyId: String(row?.legacyId || "").trim(),
    flashcardId: String(row?.flashcardId || row?.flashcard_id || "").trim(),
    word: String(row?.word || "").trim(),
    meaning: String(row?.meaning || "").trim(),
    image: String(row?.image || row?.image_url || "").trim(),
    order: Number.parseInt(String(row?.order ?? index + 1), 10) || index + 1,
    acceptedAnswers: normalizeFlashcardAcceptedAnswers(row?.acceptedAnswers ?? row?.accepted_answers),
    audioUrl: String(row?.audioUrl || row?.audio_url || "").trim(),
    audioR2Key: String(row?.audioR2Key || row?.audio_r2_key || "").trim(),
    audioProvider: String(row?.audioProvider || row?.audio_provider || "elevenlabs").trim() || "elevenlabs",
    voiceId: String(row?.voiceId || row?.voice_id || "").trim(),
    elevenLabsConfig: normalizeElevenLabsConfig(row?.elevenLabsConfig ?? row?.elevenlabs_config),
  }));
}
