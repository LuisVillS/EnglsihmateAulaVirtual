import { NextResponse } from "next/server";
import { resolveStudentFromRequest } from "@/lib/duolingo/api-auth";
import { normalizeFlashcardGameMode } from "@/lib/flashcard-arcade/constants";
import { createFlashcardGameSession, loadFlashcardDeck } from "@/lib/flashcard-arcade/service";
import { ensureGamificationProfile } from "@/lib/gamification/profile";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolution = await resolveStudentFromRequest({ request, body });
    if (resolution.errorResponse) {
      return resolution.errorResponse;
    }

    const deckKey = String(body?.deck_key || body?.deckKey || "").trim();
    const sourceContext = String(body?.source_context || body?.sourceContext || "flashcard_arcade").trim();
    const mode = normalizeFlashcardGameMode(body?.mode);

    if (!deckKey) {
      return NextResponse.json({ error: "Falta deck_key." }, { status: 400 });
    }

    const deck = await loadFlashcardDeck(resolution.db, {
      userId: resolution.profile.id,
      deckKey,
    });

    if (!deck?.deckKey) {
      return NextResponse.json({ error: "Deck no encontrado." }, { status: 404 });
    }

    const gameSession = await createFlashcardGameSession(resolution.db, {
      userId: resolution.profile.id,
      deck,
      mode,
      sourceContext,
    });

    const gamification = await ensureGamificationProfile(resolution.db, {
      userId: resolution.profile.id,
      legacyXpTotal: Number(resolution.profile?.xp_total || 0) || 0,
    });

    return NextResponse.json({
      deck,
      mode,
      gameSession,
      gamification,
    });
  } catch (error) {
    console.error("POST /api/flashcards/arcade/session failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo iniciar la sesion de flashcards." },
      { status: 500 }
    );
  }
}

