import Link from "next/link";
import { AdminCard, AdminPage, AdminPageHeader } from "@/components/admin-page";
import FlashcardDecksManager from "@/components/flashcard-decks-manager";
import FlashcardsLibraryManager from "@/components/flashcards-library-manager";
import { mapLibraryFlashcardRow } from "@/lib/flashcards";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { getSignedDownloadUrl } from "@/lib/r2";

export const metadata = {
  title: "Biblioteca de flashcards | Admin",
};

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

async function resolveFlashcardAudioUrl(row) {
  const r2Key = String(row?.audio_r2_key || "").trim();
  if (r2Key) {
    try {
      return await getSignedDownloadUrl(r2Key);
    } catch {
      // fall through to stored URL
    }
  }
  return String(row?.audio_url || "").trim() || null;
}

export default async function AdminFlashcardsPage() {
  const { supabase } = await requireAdminPageAccess();

  let cards = [];
  let decks = [];
  let errorMessage = "";

  const flashcardsResult = await supabase
    .from("flashcards")
    .select("id, word, meaning, image_url, cefr_level, theme_tag, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config")
    .order("word", { ascending: true })
    .order("created_at", { ascending: true });

  if (flashcardsResult.error) {
    const missingTable = getMissingTableName(flashcardsResult.error);
    errorMessage = missingTable?.endsWith("flashcards")
      ? "Falta crear la tabla flashcards. Ejecuta el SQL actualizado de biblioteca central."
      : (flashcardsResult.error.message || "No se pudo cargar la biblioteca de flashcards.");
  } else {
    cards = await Promise.all(
      (flashcardsResult.data || []).map(async (row) =>
        mapLibraryFlashcardRow({
          ...row,
          audio_url: await resolveFlashcardAudioUrl(row),
        })
      )
    );

    const deckRowsResult = await supabase
      .from("flashcard_decks")
      .select("id, title, description, cover_image_url, source_type, cefr_level, theme_tag, is_system, is_active")
      .eq("is_system", true)
      .order("cefr_level", { ascending: true })
      .order("title", { ascending: true });

    if (!deckRowsResult.error) {
      const deckIds = (deckRowsResult.data || []).map((row) => row.id).filter(Boolean);
      let itemsByDeck = new Map();
      if (deckIds.length) {
        const deckItemsResult = await supabase
          .from("flashcard_deck_items")
          .select("deck_id, position, flashcard:flashcards(id, word, meaning, image_url, cefr_level, theme_tag, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config)")
          .in("deck_id", deckIds)
          .order("position", { ascending: true });

        if (!deckItemsResult.error) {
          itemsByDeck = new Map();
          for (const row of deckItemsResult.data || []) {
            const deckId = String(row?.deck_id || "").trim();
            if (!deckId || !row?.flashcard?.id) continue;
            const list = itemsByDeck.get(deckId) || [];
            list.push(mapLibraryFlashcardRow(row.flashcard));
            itemsByDeck.set(deckId, list);
          }
        }
      }

      decks = (deckRowsResult.data || []).map((deck) => ({
        id: String(deck.id || "").trim(),
        title: String(deck.title || "").trim(),
        description: String(deck.description || "").trim(),
        coverImageUrl: String(deck.cover_image_url || "").trim(),
        cefrLevel: String(deck.cefr_level || "").trim().toUpperCase(),
        themeTag: String(deck.theme_tag || "").trim().toLowerCase(),
        sourceType: String(deck.source_type || "system").trim().toLowerCase(),
        isActive: deck.is_active !== false,
        cards: itemsByDeck.get(String(deck.id || "").trim()) || [],
        cardIds: (itemsByDeck.get(String(deck.id || "").trim()) || []).map((card) => card.id),
        totalCards: (itemsByDeck.get(String(deck.id || "").trim()) || []).length,
      }));
    }
  }

  return (
    <AdminPage className="mx-auto w-full max-w-7xl">
      <AdminPageHeader
        eyebrow="Contenido academico"
        title="Biblioteca de flashcards"
        description="Inventario central para clases, comisiones y plantillas con las mismas acciones de guardado, subida y audio."
        actions={
          <>
            <Link
              href="/admin/courses/templates"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Plantillas
            </Link>
            <Link
              href="/admin/commissions"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Comisiones
            </Link>
          </>
        }
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}

      <AdminCard className="p-4 sm:p-5">
        <FlashcardsLibraryManager initialCards={cards} />
      </AdminCard>

      {!errorMessage ? (
        <AdminCard className="p-4 sm:p-5">
          <FlashcardDecksManager initialDecks={decks} availableCards={cards} />
        </AdminCard>
      ) : null}
    </AdminPage>
  );
}
