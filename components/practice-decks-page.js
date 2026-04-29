"use client";

import dynamic from "next/dynamic";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppModal from "@/components/app-modal";
import PracticeDeckBuilderModal from "@/components/practice-deck-builder-modal";
import { deleteStudentFlashcardDeckAction } from "@/app/app/practice/decks/actions";
import { buildDeckProgressSummary } from "@/lib/flashcard-arcade/progress";
import { normalizeFlashcardGameMode } from "@/lib/flashcard-arcade/constants";

const FlashcardArcadePlayer = dynamic(() => import("@/components/flashcard-arcade-player"), {
  ssr: false,
  loading: () => (
    <section className="rounded-2xl bg-white px-6 py-10 text-center shadow-[0px_12px_32px_rgba(0,25,67,0.06)]">
      <p className="text-sm text-slate-500">Preparing your flashcard deck...</p>
    </section>
  ),
});

function buildCopy(language) {
  if (language === "en") {
    return {
      searchPlaceholder: "Search decks or topics...",
      eyebrow: "Learning resources",
      title: "Deck Library",
      description:
        "Boost retention with intelligent flashcards designed around your real study material. Filter by level or category to find the perfect deck for today.",
      category: "Category",
      difficulty: "Difficulty",
      all: "All",
      progress: "Progress",
      cards: "cards",
      mastered: "mastered",
      study: "Study",
      createTitle: "Create Your Deck",
      createBody: "Build a personal deck with the flashcards you want to review together.",
      createCta: "Create now",
      edit: "Edit",
      delete: "Delete",
      deleting: "Deleting...",
      noResults: "No decks match your search yet. Try another topic or reset the filters.",
    };
  }

  return {
    searchPlaceholder: "Buscar decks o temas...",
    eyebrow: "Recursos de aprendizaje",
    title: "Biblioteca de Decks",
    description:
      "Potencia tu retencion con flashcards inteligentes disenadas por expertos. Filtra por dificultad o categoria para encontrar el material perfecto para tu sesion de hoy.",
    category: "Categoria",
    difficulty: "Dificultad",
    all: "Todos",
    progress: "Progreso",
    cards: "tarjetas",
    mastered: "dominado",
    study: "Estudiar",
    createTitle: "Crea Tu Deck",
    createBody: "Arma un deck personal con las flashcards que quieras repasar juntas.",
    createCta: "Crear ahora",
    edit: "Editar",
    delete: "Eliminar",
    deleting: "Eliminando...",
    noResults: "No hay decks que coincidan con tu busqueda. Prueba con otro tema o restablece los filtros.",
  };
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
    coverImageUrl: deck?.coverImageUrl || "",
    sourceType: deck?.sourceType || "system",
    sourceLabel: deck?.sourceLabel || "",
    cefrLevel: deck?.cefrLevel || "",
    themeTag: deck?.themeTag || "",
    totalCards: stats.totalCards,
    weakCards: stats.weakCards,
    averageMastery: stats.averageMastery,
    completionPercent: stats.completionPercent,
  };
}

function formatLevelLabel(value, language) {
  const level = String(value || "").trim().toUpperCase();
  if (!level) return language === "en" ? "All" : "Todos";
  if (level.startsWith("A1") || level.startsWith("A2")) return language === "en" ? "Beginner" : "Principiante";
  if (level.startsWith("B1") || level.startsWith("B2")) return language === "en" ? "Intermediate" : "Intermedio";
  return language === "en" ? "Advanced" : "Avanzado";
}

function prettify(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16l-5-3-5 3V5Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function DeckCard({
  deck,
  copy,
  onOpen,
  onEdit,
  onDelete,
  deletePending = false,
  editPending = false,
  studyPending = false,
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0px_12px_32px_rgba(0,25,67,0.06)] transition-all duration-300 hover:-translate-y-1">
      <div className="relative h-48 overflow-hidden">
        {deck.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={deck.coverImageUrl}
            alt={deck.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-[linear-gradient(135deg,#7892b7_0%,#314f80_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#002a5c]/60 to-transparent" />
        <div className="absolute bottom-4 left-4">
          <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase text-white backdrop-blur-md">
            {formatLevelLabel(deck.cefrLevel, copy.title === "Deck Library" ? "en" : "es")}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="text-xl font-bold leading-tight text-[#002a5c]">{deck.title}</h3>
          <button type="button" className="text-slate-300 transition-colors hover:text-[#002a5c]" aria-label={`Bookmark ${deck.title}`}>
            <BookmarkIcon />
          </button>
        </div>

        <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <LayersIcon />
          <span>{deck.totalCards} {copy.cards}</span>
        </div>

        <div className="mt-auto space-y-2">
          {deck.isEditable ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onEdit?.(deck)}
                disabled={editPending || deletePending}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#002a5c] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copy.edit}
              </button>
              <button
                type="button"
                onClick={() => onDelete?.(deck)}
                disabled={deletePending || editPending}
                className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletePending ? copy.deleting : copy.delete}
              </button>
            </div>
          ) : null}
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-500">{copy.progress}</span>
            <span className="text-[#002a5c]">{deck.completionPercent}% {copy.mastered}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#d9e2ff]">
            <div className="h-full rounded-full bg-[#002a5c]" style={{ width: `${Math.max(0, Math.min(100, Number(deck.completionPercent || 0) || 0))}%` }} />
          </div>
          <button
            type="button"
            onClick={() => onOpen(deck.deckKey)}
            disabled={studyPending}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#001943] to-[#102e62] py-3 font-bold text-white shadow-lg shadow-blue-900/10 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {studyPending ? "..." : copy.study}
          </button>
        </div>
      </div>
    </article>
  );
}

function CreateDeckCard({ copy, onCreate }) {
  return (
    <article className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgba(196,198,209,0.3)] bg-[#f3f4f5] p-8 text-center transition-all duration-300 hover:bg-[#e7e8e9]">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#002a5c] shadow-sm">
        <PlusIcon />
      </div>
      <h3 className="mb-2 text-xl font-bold text-[#002a5c]">{copy.createTitle}</h3>
      <p className="mb-6 max-w-[220px] text-sm leading-8 text-slate-500">{copy.createBody}</p>
      <button
        type="button"
        onClick={onCreate}
        className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-[#002a5c] shadow-sm transition-all hover:bg-[#002a5c] hover:text-white"
      >
        {copy.createCta}
      </button>
    </article>
  );
}

export default function PracticeDecksPage({
  student,
  flashcardHub,
  initialParams,
  language = "es",
  availableDeckCards = [],
}) {
  const copy = buildCopy(language);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(copy.all);
  const [difficulty, setDifficulty] = useState(copy.all);
  const [decks, setDecks] = useState(Array.isArray(flashcardHub?.decks) ? flashcardHub.decks : []);
  const [recommendedDeck, setRecommendedDeck] = useState(flashcardHub?.recommendedDeck || null);
  const [activeDeck, setActiveDeck] = useState(null);
  const [gamification, setGamification] = useState(flashcardHub?.gamification || null);
  const [competition, setCompetition] = useState(flashcardHub?.competition || null);
  const [loadingDeckKey, setLoadingDeckKey] = useState("");
  const [error, setError] = useState("");
  const [deckBuilderOpen, setDeckBuilderOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);
  const [editingDeckKey, setEditingDeckKey] = useState("");
  const [deletingDeckId, setDeletingDeckId] = useState("");

  const categoryOptions = Array.from(new Set([copy.all, ...decks.map((deck) => prettify(deck.themeTag || deck.sourceLabel || copy.all)).filter(Boolean)]));
  const difficultyOptions = Array.from(new Set([copy.all, ...decks.map((deck) => formatLevelLabel(deck.cefrLevel, language)).filter(Boolean)]));
  const filteredDecks = decks.filter((deck) => {
    const matchesQuery = !query.trim()
      || [deck.title, deck.description, deck.themeTag, deck.sourceLabel].some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase()));
    const matchesCategory = category === copy.all || prettify(deck.themeTag || deck.sourceLabel) === category;
    const matchesDifficulty = difficulty === copy.all || formatLevelLabel(deck.cefrLevel, language) === difficulty;
    return matchesQuery && matchesCategory && matchesDifficulty;
  });

  function handleDeckExit(updatedDeck) {
    const nextSummary = updatedDeck?.deckKey ? summarizeDeck(updatedDeck) : null;
    if (nextSummary?.deckKey) {
      setDecks((current) => current.map((deck) => (deck.deckKey === nextSummary.deckKey ? nextSummary : deck)));
      if (recommendedDeck?.deckKey === nextSummary.deckKey) {
        setRecommendedDeck(nextSummary);
      }
    }

    setActiveDeck(null);
    setError("");
  }

  function closeDeckModal() {
    setActiveDeck(null);
    setError("");
  }

  async function openDeck(deckKey, mode = initialParams?.mode || "") {
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

      const resolvedDeck = {
        ...(data?.deck || {}),
        _initialMode: mode ? normalizeFlashcardGameMode(mode) : "",
      };
      setActiveDeck(resolvedDeck);
    } catch (deckError) {
      setError(deckError.message || "No se pudo cargar el deck.");
    } finally {
      setLoadingDeckKey("");
    }
  }

  function openCreateDeck() {
    setEditingDeck(null);
    setEditingDeckKey("");
    setDeckBuilderOpen(true);
    setError("");
  }

  async function openEditDeck(deck) {
    const deckKey = String(deck?.deckKey || "").trim();
    if (!deckKey) return;
    setEditingDeckKey(deckKey);
    setError("");

    try {
      const response = await fetch(`/api/flashcards/arcade/decks?deck_key=${encodeURIComponent(deckKey)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cargar el deck para editar.");
      }

      setEditingDeck(data?.deck || null);
      setDeckBuilderOpen(true);
    } catch (deckError) {
      setError(deckError.message || "No se pudo cargar el deck para editar.");
    } finally {
      setEditingDeckKey("");
    }
  }

  function handleDeleteDeck(deck) {
    const deckId = String(deck?.deckId || "").trim();
    if (!deckId || deletingDeckId) return;

    setDeletingDeckId(deckId);
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("deckId", deckId);
      try {
        const result = await deleteStudentFlashcardDeckAction(null, formData);
        if (!result?.success) {
          throw new Error(result?.error || "No se pudo eliminar el deck.");
        }
        setDecks(Array.isArray(result.decks) ? result.decks : []);
        setRecommendedDeck(result.recommendedDeck || null);
      } catch (deleteError) {
        setError(deleteError.message || "No se pudo eliminar el deck.");
      } finally {
        setDeletingDeckId("");
      }
    });
  }

  useEffect(() => {
    const requestedDeckKey = String(initialParams?.deckKey || "").trim();
    const requestedMode = String(initialParams?.mode || "").trim();
    if (!requestedDeckKey && !requestedMode) return;
    router.replace("/app/practice/decks");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-12 bg-[#f8f9fa] text-[#191c1d]">
      <section className="mb-12 space-y-8">
        <div className="relative w-full max-w-2xl">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <SearchIcon />
          </span>
          <input
            className="w-full rounded-2xl border-none bg-[#f3f4f5] py-4 pl-12 pr-6 text-sm shadow-sm transition-all placeholder:text-slate-400 focus:ring-2 focus:ring-[#002a5c]/20"
            placeholder={copy.searchPlaceholder}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[#44464f]">{copy.eyebrow}</span>
            <h1 className="text-4xl font-extrabold tracking-tight text-[#002a5c]">{copy.title}</h1>
            <p className="mt-2 max-w-2xl leading-relaxed text-[#44464f]">{copy.description}</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="px-1 text-[10px] font-bold uppercase text-slate-400">{copy.category}</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="cursor-pointer rounded-xl border-none bg-[#f3f4f5] px-4 py-2.5 text-sm transition-all focus:ring-[#002a5c]/10"
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="px-1 text-[10px] font-bold uppercase text-slate-400">{copy.difficulty}</span>
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                className="cursor-pointer rounded-xl border-none bg-[#f3f4f5] px-4 py-2.5 text-sm transition-all focus:ring-[#002a5c]/10"
              >
                {difficultyOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <button type="button" className="mt-5 rounded-xl bg-[#e7e8e9] p-2.5 text-[#002a5c] transition-colors hover:bg-slate-200" aria-label="Filters">
              <FilterIcon />
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <section>
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {filteredDecks.map((deck) => (
            <DeckCard
              key={deck.deckKey}
              deck={deck}
              copy={copy}
              onOpen={(deckKey) => openDeck(deckKey)}
              onEdit={openEditDeck}
              onDelete={handleDeleteDeck}
              deletePending={deletingDeckId === deck.deckId}
              editPending={editingDeckKey === deck.deckKey}
              studyPending={loadingDeckKey === deck.deckKey}
            />
          ))}
          <CreateDeckCard copy={copy} onCreate={openCreateDeck} />

          {!filteredDecks.length ? (
            <div className="rounded-2xl bg-white p-8 text-sm text-slate-500 shadow-[0px_12px_32px_rgba(0,25,67,0.06)] md:col-span-2 xl:col-span-2">
              {copy.noResults}
            </div>
          ) : null}
        </div>
      </section>

      <PracticeDeckBuilderModal
        key={`${deckBuilderOpen ? "open" : "closed"}:${editingDeck?.deckKey || editingDeck?.deckId || "new"}:${student?.cefrLevel || ""}`}
        open={deckBuilderOpen}
        onClose={() => {
          setDeckBuilderOpen(false);
          setEditingDeck(null);
          setEditingDeckKey("");
        }}
        onSaved={(result) => {
          setDecks(Array.isArray(result?.decks) ? result.decks : []);
          setRecommendedDeck(result?.recommendedDeck || null);
          setDeckBuilderOpen(false);
          setEditingDeck(null);
          setEditingDeckKey("");
          setError("");
        }}
        initialDeck={editingDeck}
        availableCards={availableDeckCards}
        studentLevel={student?.cefrLevel || ""}
        language={language}
      />

      <AppModal
        open={Boolean(activeDeck)}
        onClose={closeDeckModal}
        title={activeDeck?.title || "Practicar deck"}
        widthClass="max-w-none"
        dismissible
        fullScreen
      >
        {activeDeck ? (
          <FlashcardArcadePlayer
            deck={activeDeck}
            gamification={gamification}
            embedded
            minimalLauncher
            initialMode={activeDeck?._initialMode || ""}
            sourceContext="practice_decks"
            onGamificationChange={(nextGamification) => setGamification(nextGamification)}
            onCompetitionChange={(nextCompetition) => setCompetition(nextCompetition)}
            onExit={handleDeckExit}
          />
        ) : null}
      </AppModal>
    </section>
  );
}
