import { redirect } from "next/navigation";

export const metadata = {
  title: "Flashcard Arcade | Aula Virtual",
};

export default async function FlashcardsPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const params = new URLSearchParams();

  const deck = String(searchParams?.deck || searchParams?.deck_key || searchParams?.deckKey || "").trim();
  const mode = String(searchParams?.flashcard_mode || searchParams?.flashcardMode || searchParams?.mode || "").trim();
  if (deck) params.set("deck", deck);
  if (mode) params.set("mode", mode);

  redirect(params.toString() ? `/app/practice/decks?${params.toString()}` : "/app/practice/decks");
}
