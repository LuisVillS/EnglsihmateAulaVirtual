import { NextResponse } from "next/server";
import { resolveStudentFromRequest } from "@/lib/duolingo/api-auth";
import { loadFlashcardDeck } from "@/lib/flashcard-arcade/service";

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const deckKey = String(searchParams.get("deck_key") || searchParams.get("deckKey") || "").trim();
    if (!deckKey) {
      return NextResponse.json({ error: "Falta deck_key." }, { status: 400 });
    }

    const resolution = await resolveStudentFromRequest({ request, searchParams });
    if (resolution.errorResponse) {
      return resolution.errorResponse;
    }

    const deck = await loadFlashcardDeck(resolution.db, {
      userId: resolution.profile.id,
      deckKey,
    });

    if (!deck?.deckKey) {
      return NextResponse.json({ error: "Deck no encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      deck,
    });
  } catch (error) {
    console.error("GET /api/flashcards/arcade/decks failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar el deck de flashcards." },
      { status: 500 }
    );
  }
}

