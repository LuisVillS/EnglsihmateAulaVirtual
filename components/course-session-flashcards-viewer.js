"use client";

import { useMemo } from "react";
import FlashcardArcadePlayer from "@/components/flashcard-arcade-player";

function normalizeCards(cards = []) {
  return (Array.isArray(cards) ? cards : []).map((card, index) => ({
    ...card,
    id: String(card?.id || card?.flashcardId || `flashcard-${index + 1}`),
    flashcardId: String(card?.flashcardId || card?.id || "").trim(),
    order: Number(card?.order || index + 1) || index + 1,
  }));
}

export default function CourseSessionFlashcardsViewer({
  title = "Flashcards",
  sessionTitle = "",
  sessionId = "",
  flashcards = [],
}) {
  const deck = useMemo(() => ({
    deckId: null,
    deckKey: sessionId ? `session:${String(sessionId).trim()}` : `session:inline-${String(title).trim().toLowerCase().replace(/\s+/g, "-")}`,
    title,
    description: sessionTitle
      ? `Assigned flashcards from ${sessionTitle}.`
      : "Assigned flashcards from your class session.",
    sourceType: "session",
    sourceLabel: sessionTitle || "My course",
    cards: normalizeCards(flashcards),
  }), [flashcards, sessionId, sessionTitle, title]);

  return (
    <FlashcardArcadePlayer
      deck={deck}
      embedded
      sourceContext="course_flashcards_modal"
    />
  );
}

