import { normalizeStudentCefrLevel } from "@/lib/student-levels";

const STUDENT_DECK_BUILDER_CARD_SELECT =
  "id, word, meaning, image_url, cefr_level, theme_tag";

export async function loadStudentDeckBuilderCards(db, { cefrLevel = "", limit = 300 } = {}) {
  const normalizedLevel = normalizeStudentCefrLevel(cefrLevel);
  let query = db
    .from("flashcards")
    .select(STUDENT_DECK_BUILDER_CARD_SELECT)
    .order("theme_tag", { ascending: true, nullsFirst: true })
    .order("word", { ascending: true })
    .limit(Math.max(1, Math.min(500, Number(limit || 300) || 300)));

  if (normalizedLevel) {
    query = query.or(`cefr_level.eq.${normalizedLevel},cefr_level.is.null`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "No se pudo cargar la biblioteca de flashcards.");
  }

  return (data || []).map((row) => ({
    id: String(row?.id || "").trim(),
    word: String(row?.word || "").trim(),
    meaning: String(row?.meaning || "").trim(),
    imageUrl: String(row?.image_url || "").trim(),
    cefrLevel: String(row?.cefr_level || "").trim().toUpperCase(),
    themeTag: String(row?.theme_tag || "").trim().toLowerCase(),
  }));
}
