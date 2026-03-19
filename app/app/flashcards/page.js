import { redirect } from "next/navigation";

export const metadata = {
  title: "Flashcard Arcade | Aula Virtual",
};

export default async function FlashcardsPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const params = new URLSearchParams();
  params.set("tab", "flashcards");

  const deck = String(searchParams?.deck || searchParams?.deck_key || searchParams?.deckKey || "").trim();
  const mode = String(searchParams?.flashcard_mode || searchParams?.flashcardMode || searchParams?.mode || "").trim();
  if (deck) params.set("deck", deck);
  if (mode) params.set("flashcard_mode", mode);

  redirect(`/app/practice?${params.toString()}`);
}
