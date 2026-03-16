"use client";

import dynamic from "next/dynamic";
import { startTransition, useState } from "react";
import { FLASHCARD_GAME_MODE_LABELS } from "@/lib/flashcard-arcade/constants";
import { buildDeckProgressSummary } from "@/lib/flashcard-arcade/progress";
import CompetitionSummaryCard from "@/components/competition-summary-card";

const FlashcardArcadePlayer = dynamic(() => import("@/components/flashcard-arcade-player"), {
  ssr: false,
  loading: () => (
    <section className="student-panel px-6 py-8 text-center">
      <p className="text-sm text-muted">Preparing your flashcard deck...</p>
    </section>
  ),
});

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function DeckCard({ deck, onOpen, loading = false, badge = "" }) {
  return (
    <article className="rounded-[20px] border border-[rgba(16,52,116,0.1)] bg-white px-5 py-5 shadow-[0_16px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {badge ? (
            <span className="inline-flex rounded-full border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#103474]">
              {badge}
            </span>
          ) : null}
          <h3 className="mt-3 text-xl font-semibold text-foreground">{deck.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{deck.description || deck.sourceLabel || "Flashcard deck"}</p>
        </div>
        <span className="rounded-full border border-[rgba(16,52,116,0.12)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#103474]">
          {deck.sourceLabel || deck.sourceType}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-[#fbfdff] px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Cards</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{deck.totalCards}</p>
        </div>
        <div className="rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-[#fbfdff] px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Completion</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{deck.completionPercent}%</p>
        </div>
        <div className="rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-[#fbfdff] px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Weak cards</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{deck.weakCards}</p>
        </div>
      </div>

      <div className="mt-5 h-3 w-full rounded-full bg-[#eef3ff]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
          style={{ width: `${Math.max(0, Math.min(100, Number(deck.averageMastery || 0) || 0))}%` }}
        />
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={onOpen}
          disabled={loading}
          className="student-button-primary px-4 py-3 text-sm disabled:opacity-60"
        >
          {loading ? "Loading..." : "Open deck"}
        </button>
      </div>
    </article>
  );
}

function summarizeDeck(deck) {
  const cards = Array.isArray(deck?.cards) ? deck.cards : [];
  const stats = buildDeckProgressSummary(
    cards,
    new Map(cards.map((card) => [String(card?.flashcardId || card?.id || "").trim(), card?.progress || {}]))
  );

  return {
    deckId: deck?.deckId || null,
    deckKey: deck?.deckKey || "",
    title: deck?.title || "Flashcards",
    description: deck?.description || "",
    sourceType: deck?.sourceType || "system",
    sourceLabel: deck?.sourceLabel || "",
    totalCards: stats.totalCards,
    seenCards: stats.seenCards,
    masteredCards: stats.masteredCards,
    strongCards: stats.strongCards,
    weakCards: stats.weakCards,
    averageMastery: stats.averageMastery,
    completionPercent: stats.completionPercent,
  };
}

export default function FlashcardArcadeHub({
  initialStudent,
  initialHubData,
}) {
  const [gamification, setGamification] = useState(initialHubData?.gamification || null);
  const [competition, setCompetition] = useState(initialHubData?.competition || null);
  const [decks, setDecks] = useState(initialHubData?.decks || []);
  const [recommendedDeck, setRecommendedDeck] = useState(initialHubData?.recommendedDeck || null);
  const [recentSession] = useState(initialHubData?.recentSession || null);
  const [activeDeck, setActiveDeck] = useState(null);
  const [loadingDeckKey, setLoadingDeckKey] = useState("");
  const [error, setError] = useState("");

  async function openDeck(deckKey) {
    if (!deckKey) return;
    setLoadingDeckKey(deckKey);
    setError("");

    try {
      const response = await fetch(`/api/flashcards/arcade/decks?deck_key=${encodeURIComponent(deckKey)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cargar el deck.");
      }

      startTransition(() => {
        setActiveDeck(data?.deck || null);
      });
    } catch (deckError) {
      setError(deckError.message || "No se pudo cargar el deck.");
    } finally {
      setLoadingDeckKey("");
    }
  }

  if (activeDeck) {
    return (
      <FlashcardArcadePlayer
        deck={activeDeck}
        gamification={gamification}
        sourceContext="flashcard_arcade_hub"
        onGamificationChange={setGamification}
        onCompetitionChange={setCompetition}
        onExit={(updatedDeck) => {
          const nextSummary = updatedDeck?.deckKey ? summarizeDeck(updatedDeck) : null;
          if (nextSummary?.deckKey) {
            setDecks((current) => current.map((deck) => (deck.deckKey === nextSummary.deckKey ? nextSummary : deck)));
            if (recommendedDeck?.deckKey === nextSummary.deckKey) {
              setRecommendedDeck(nextSummary);
            }
          }
          setActiveDeck(null);
        }}
      />
    );
  }

  const level = Number(gamification?.level || 1) || 1;
  const xpIntoLevel = Number(gamification?.xpIntoLevel || 0) || 0;
  const xpToNextLevel = Number(gamification?.xpToNextLevel || 0) || 0;
  const progressPercent = Number(gamification?.progressPercent || 0) || 0;

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel relative overflow-hidden px-6 py-7 sm:px-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_top_right,rgba(241,61,79,0.16),transparent_58%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[48%] bg-[radial-gradient(circle_at_bottom_left,rgba(16,52,116,0.18),transparent_60%)]" />
        <div className="relative grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-muted">Flashcard Arcade</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Deck-based training with lightweight game modes.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Choose a deck, jump into a mode, and turn assigned flashcards into mastery and permanent XP.
            </p>
            <p className="mt-4 text-sm font-medium text-foreground">
              {initialStudent?.fullName || "Student"} · {initialStudent?.courseLevel || "Open track"}
            </p>
          </div>

          <div className="student-panel-soft px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Current level</p>
                <h2 className="mt-2 text-3xl font-semibold text-foreground">Level {level}</h2>
                <p className="mt-1 text-sm text-muted">{Number(gamification?.lifetimeXp || 0)} lifetime XP</p>
              </div>
              <span className="rounded-full border border-[rgba(16,52,116,0.12)] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#103474]">
                Flashcards
              </span>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Progress to next level</span>
                <span className="text-muted">{xpIntoLevel} XP in level</span>
              </div>
              <div className="mt-3 h-3 w-full rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-muted">{xpToNextLevel} XP to reach Level {level + 1}</p>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Recommended deck</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{recommendedDeck?.title || "Start with any assigned deck"}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {recommendedDeck
              ? `${recommendedDeck.totalCards} cards · ${recommendedDeck.completionPercent}% completion · ${recommendedDeck.weakCards} weak cards to recover.`
              : "Your assigned decks will appear here as soon as flashcards are available in your course."}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Completion</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{recommendedDeck?.completionPercent || 0}%</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Avg mastery</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{recommendedDeck?.averageMastery || 0}%</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Weak cards</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{recommendedDeck?.weakCards || 0}</p>
            </div>
          </div>
          {recommendedDeck?.deckKey ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => openDeck(recommendedDeck.deckKey)}
                disabled={loadingDeckKey === recommendedDeck.deckKey}
                className="student-button-primary px-4 py-3 text-sm disabled:opacity-60"
              >
                {loadingDeckKey === recommendedDeck.deckKey ? "Loading..." : "Open recommended deck"}
              </button>
            </div>
          ) : null}
        </section>

        <aside className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Recent session</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{recentSession?.deckTitle || "No flashcard runs yet"}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {recentSession
              ? `${FLASHCARD_GAME_MODE_LABELS[recentSession.mode] || recentSession.mode} · ${recentSession.accuracyRate}% accuracy · +${recentSession.xpEarned} XP on ${formatDate(recentSession.completedAt || recentSession.startedAt)}.`
              : "Your latest arcade run will appear here after you finish a deck mode."}
          </p>
          {recentSession ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Mode</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{FLASHCARD_GAME_MODE_LABELS[recentSession.mode] || recentSession.mode}</p>
              </div>
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Score</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{recentSession.score}</p>
              </div>
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">XP</p>
                <p className="mt-2 text-lg font-semibold text-foreground">+{recentSession.xpEarned}</p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Decks</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Choose your source</h2>
        </div>

        {decks.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {decks.map((deck) => (
              <DeckCard
                key={deck.deckKey}
                deck={deck}
                badge={deck.deckKey === recommendedDeck?.deckKey ? "Recommended" : ""}
                loading={loadingDeckKey === deck.deckKey}
                onOpen={() => openDeck(deck.deckKey)}
              />
            ))}
          </div>
        ) : (
          <div className="student-panel px-6 py-8 text-center text-sm text-muted">
            Your available flashcard decks will appear here once a class session or system deck is ready.
          </div>
        )}
      </section>

      <CompetitionSummaryCard competition={competition} />
    </section>
  );
}
