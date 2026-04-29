"use server";

import { revalidatePath } from "next/cache";
import { buildSavedDeckKey, FLASHCARD_DECK_SOURCE_TYPES } from "@/lib/flashcard-arcade/constants";
import { loadFlashcardArcadeSectionData } from "@/lib/flashcard-arcade/service";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { normalizeStudentCefrLevel, normalizeStudentThemeTag } from "@/lib/student-levels";

const MAX_STUDENT_DECK_CARDS = 120;
const FLASHCARD_LIBRARY_SELECT = "id, word, meaning, cefr_level";
const FLASHCARD_DECK_MUTATION_SELECT =
  "id, title, description, cover_image_url, source_type, cefr_level, theme_tag, owner_user_id, is_system, is_active";

function getText(formData, key) {
  return String(formData?.get(key) || "").trim();
}

function parseDeckCardIds(formData) {
  try {
    const parsed = JSON.parse(getText(formData, "cardIdsJson") || "[]");
    return Array.from(
      new Set(
        (Array.isArray(parsed) ? parsed : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  } catch {
    throw new Error("La seleccion de flashcards no es valida.");
  }
}

async function requireStudentDeckAccess() {
  const context = await getRequestUserContext();
  if (!context?.user?.id) {
    throw new Error("No autorizado.");
  }
  if (context.isAdmin || context.role !== USER_ROLES.STUDENT) {
    throw new Error("Solo los estudiantes pueden crear decks personales.");
  }
  return context;
}

async function buildStudentDeckPayload({ supabase, userId, deckId, title, description, cefrLevel, themeTag, cardIds }) {
  if (!title) {
    throw new Error("El titulo del deck es obligatorio.");
  }
  if (!cefrLevel) {
    throw new Error("Selecciona un nivel CEFR para el deck.");
  }
  if (!cardIds.length) {
    throw new Error("Selecciona al menos una flashcard.");
  }
  if (cardIds.length > MAX_STUDENT_DECK_CARDS) {
    throw new Error(`Tu deck puede tener como maximo ${MAX_STUDENT_DECK_CARDS} flashcards.`);
  }

  const { data: cards, error: cardsError } = await supabase
    .from("flashcards")
    .select(FLASHCARD_LIBRARY_SELECT)
    .in("id", cardIds);

  if (cardsError) {
    throw new Error(cardsError.message || "No se pudo validar la biblioteca de flashcards.");
  }
  if ((cards || []).length !== cardIds.length) {
    throw new Error("Algunas flashcards seleccionadas ya no existen.");
  }

  const invalidCard = (cards || []).find((card) => {
    const cardLevel = normalizeStudentCefrLevel(card?.cefr_level);
    return cardLevel && cardLevel !== cefrLevel;
  });
  if (invalidCard) {
    throw new Error("Todas las flashcards del deck deben pertenecer al mismo nivel CEFR.");
  }

  if (deckId) {
    const { data: existingDeck, error: existingDeckError } = await supabase
      .from("flashcard_decks")
      .select("id")
      .eq("id", deckId)
      .eq("owner_user_id", userId)
      .eq("source_type", FLASHCARD_DECK_SOURCE_TYPES.STUDENT)
      .maybeSingle();

    if (existingDeckError) {
      throw new Error(existingDeckError.message || "No se pudo validar el deck.");
    }
    if (!existingDeck?.id) {
      throw new Error("Ese deck no te pertenece o ya no existe.");
    }
  }

  return {
    title,
    description: description || null,
    cover_image_url: null,
    source_type: FLASHCARD_DECK_SOURCE_TYPES.STUDENT,
    cefr_level: cefrLevel,
    theme_tag: themeTag || null,
    owner_user_id: userId,
    is_system: false,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
}

async function loadStudentDeckResponseData(supabase, { userId, courseLevel }) {
  const sectionData = await loadFlashcardArcadeSectionData(supabase, {
    userId,
    courseLevel,
  });

  return {
    decks: sectionData.decks || [],
    recommendedDeck: sectionData.recommendedDeck || null,
  };
}

export async function upsertStudentFlashcardDeckAction(_prevState, formData) {
  try {
    const { supabase, user, profile } = await requireStudentDeckAccess();
    const deckId = getText(formData, "deckId");
    const title = getText(formData, "title");
    const description = getText(formData, "description");
    const cefrLevel =
      normalizeStudentCefrLevel(getText(formData, "cefrLevel")) ||
      normalizeStudentCefrLevel(profile?.course_level || "");
    const themeTag = normalizeStudentThemeTag(getText(formData, "themeTag"));
    const cardIds = parseDeckCardIds(formData);
    const payload = await buildStudentDeckPayload({
      supabase,
      userId: user.id,
      deckId,
      title,
      description,
      cefrLevel,
      themeTag,
      cardIds,
    });

    const deckResult = deckId
      ? await supabase
          .from("flashcard_decks")
          .update(payload)
          .eq("id", deckId)
          .eq("owner_user_id", user.id)
          .eq("source_type", FLASHCARD_DECK_SOURCE_TYPES.STUDENT)
          .select(FLASHCARD_DECK_MUTATION_SELECT)
          .maybeSingle()
      : await supabase
          .from("flashcard_decks")
          .insert(payload)
          .select(FLASHCARD_DECK_MUTATION_SELECT)
          .maybeSingle();

    if (deckResult.error || !deckResult.data?.id) {
      throw new Error(deckResult.error?.message || "No se pudo guardar el deck.");
    }

    const savedDeckId = String(deckResult.data.id || "").trim();
    const deleteItemsResult = await supabase.from("flashcard_deck_items").delete().eq("deck_id", savedDeckId);
    if (deleteItemsResult.error) {
      throw new Error(deleteItemsResult.error.message || "No se pudo actualizar el contenido del deck.");
    }

    const insertItemsResult = await supabase.from("flashcard_deck_items").insert(
      cardIds.map((flashcardId, index) => ({
        deck_id: savedDeckId,
        flashcard_id: flashcardId,
        position: index + 1,
        updated_at: new Date().toISOString(),
      }))
    );

    if (insertItemsResult.error) {
      throw new Error(insertItemsResult.error.message || "No se pudieron guardar las flashcards del deck.");
    }

    revalidatePath("/app/practice");
    revalidatePath("/app/practice/decks");

    return {
      success: true,
      error: null,
      message: deckId ? "Deck actualizado." : "Deck creado.",
      savedDeckKey: buildSavedDeckKey(savedDeckId),
      ...(await loadStudentDeckResponseData(supabase, {
        userId: user.id,
        courseLevel: profile?.course_level || "",
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "No se pudo guardar el deck.",
      message: null,
      decks: [],
      recommendedDeck: null,
      savedDeckKey: "",
    };
  }
}

export async function deleteStudentFlashcardDeckAction(_prevState, formData) {
  try {
    const { supabase, user, profile } = await requireStudentDeckAccess();
    const deckId = getText(formData, "deckId");
    if (!deckId) {
      throw new Error("Deck invalido.");
    }

    const deckResult = await supabase
      .from("flashcard_decks")
      .select("id")
      .eq("id", deckId)
      .eq("owner_user_id", user.id)
      .eq("source_type", FLASHCARD_DECK_SOURCE_TYPES.STUDENT)
      .maybeSingle();

    if (deckResult.error) {
      throw new Error(deckResult.error.message || "No se pudo validar el deck.");
    }
    if (!deckResult.data?.id) {
      throw new Error("Ese deck no te pertenece o ya fue eliminado.");
    }

    const deleteResult = await supabase.from("flashcard_decks").delete().eq("id", deckId);
    if (deleteResult.error) {
      throw new Error(deleteResult.error.message || "No se pudo eliminar el deck.");
    }

    revalidatePath("/app/practice");
    revalidatePath("/app/practice/decks");

    return {
      success: true,
      error: null,
      message: "Deck eliminado.",
      ...(await loadStudentDeckResponseData(supabase, {
        userId: user.id,
        courseLevel: profile?.course_level || "",
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "No se pudo eliminar el deck.",
      message: null,
      decks: [],
      recommendedDeck: null,
    };
  }
}
