"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import AppModal from "@/components/app-modal";
import { deleteFlashcardDeck, upsertFlashcardDeck } from "@/app/admin/actions";
import { STUDENT_CEFR_LEVELS } from "@/lib/student-levels";

const INITIAL_FORM_STATE = {
  success: false,
  error: null,
  message: null,
  deck: null,
};

function createEmptyDeck() {
  return {
    deckId: "",
    title: "",
    description: "",
    coverImageUrl: "",
    cefrLevel: "A1",
    themeTag: "",
    isActive: true,
    cardIds: [],
  };
}

function toDeckValues(deck = null) {
  if (!deck) return createEmptyDeck();
  return {
    deckId: String(deck.id || "").trim(),
    title: String(deck.title || "").trim(),
    description: String(deck.description || "").trim(),
    coverImageUrl: String(deck.coverImageUrl || "").trim(),
    cefrLevel: String(deck.cefrLevel || "A1").trim().toUpperCase() || "A1",
    themeTag: String(deck.themeTag || "").trim().toLowerCase(),
    isActive: deck.isActive !== false,
    cardIds: Array.isArray(deck.cardIds) ? deck.cardIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
  };
}

function sortDecks(list = []) {
  return [...list].sort((left, right) => {
    const levelCompare = String(left?.cefrLevel || "").localeCompare(String(right?.cefrLevel || ""), "en", { sensitivity: "base" });
    if (levelCompare !== 0) return levelCompare;
    return String(left?.title || "").localeCompare(String(right?.title || ""), "es", { sensitivity: "base" });
  });
}

function sortCards(list = []) {
  return [...list].sort((left, right) => {
    const levelCompare = String(left?.cefrLevel || "").localeCompare(String(right?.cefrLevel || ""), "en", { sensitivity: "base" });
    if (levelCompare !== 0) return levelCompare;
    return String(left?.word || "").localeCompare(String(right?.word || ""), "es", { sensitivity: "base" });
  });
}

function deckMatches(deck, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [deck?.title, deck?.description, deck?.themeTag, deck?.cefrLevel]
    .map((value) => String(value || "").toLowerCase())
    .some((value) => value.includes(needle));
}

function cardMatches(card, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [card?.word, card?.meaning, card?.themeTag, card?.cefrLevel]
    .map((value) => String(value || "").toLowerCase())
    .some((value) => value.includes(needle));
}

function normalizeThemeTag(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function moveInList(list = [], index, direction) {
  const next = [...list];
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

export default function FlashcardDecksManager({ initialDecks = [], availableCards = [] }) {
  const [state, formAction, pending] = useActionState(upsertFlashcardDeck, INITIAL_FORM_STATE);
  const [decks, setDecks] = useState(() => sortDecks(initialDecks));
  const [query, setQuery] = useState("");
  const [cardQuery, setCardQuery] = useState("");
  const [formValues, setFormValues] = useState(() => createEmptyDeck());
  const [modalOpen, setModalOpen] = useState(false);
  const [clientError, setClientError] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (!state?.deck) return;
    const savedDeck = state.deck;
    startTransition(() => {
      setDecks((current) => {
        const exists = current.some((deck) => String(deck.id || "") === String(savedDeck.id || ""));
        const next = exists
          ? current.map((deck) => (String(deck.id || "") === String(savedDeck.id || "") ? savedDeck : deck))
          : [...current, savedDeck];
        return sortDecks(next);
      });
      setClientError("");
      setClientMessage(state.message || "");
      setModalOpen(false);
      setFormValues(createEmptyDeck());
    });
  }, [state]);

  const cards = useMemo(() => sortCards(availableCards), [availableCards]);
  const filteredDecks = useMemo(() => decks.filter((deck) => deckMatches(deck, query)), [decks, query]);
  const filteredCards = useMemo(
    () =>
      cards.filter((card) => {
        if (formValues.cefrLevel && card.cefrLevel && card.cefrLevel !== formValues.cefrLevel) return false;
        return cardMatches(card, cardQuery);
      }),
    [cardQuery, cards, formValues.cefrLevel]
  );

  const selectedCards = useMemo(() => {
    const byId = new Map(cards.map((card) => [String(card.id || "").trim(), card]));
    return formValues.cardIds
      .map((cardId) => byId.get(cardId))
      .filter(Boolean);
  }, [cards, formValues.cardIds]);

  function openCreate() {
    setClientError("");
    setClientMessage("");
    setCardQuery("");
    setFormValues(createEmptyDeck());
    setModalOpen(true);
  }

  function openEdit(deck) {
    setClientError("");
    setClientMessage("");
    setCardQuery("");
    setFormValues(toDeckValues(deck));
    setModalOpen(true);
  }

  function addCard(cardId) {
    setFormValues((current) => {
      if (current.cardIds.includes(cardId)) return current;
      return {
        ...current,
        cardIds: [...current.cardIds, cardId],
      };
    });
  }

  function removeCard(cardId) {
    setFormValues((current) => ({
      ...current,
      cardIds: current.cardIds.filter((value) => value !== cardId),
    }));
  }

  async function handleDelete(deckId) {
    if (!deckId || deletingId) return;
    setDeletingId(deckId);
    setClientError("");
    setClientMessage("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("deckId", deckId);
      try {
        const result = await deleteFlashcardDeck(null, formData);
        if (result?.success) {
          setDecks((current) => current.filter((deck) => String(deck.id || "") !== String(deckId)));
          setClientMessage(result.message || "Deck eliminado.");
        } else {
          setClientError(result?.error || "No se pudo eliminar el deck.");
        }
      } catch {
        setClientError("No se pudo eliminar el deck.");
      }
      setDeletingId("");
    });
  }

  return (
    <div className="space-y-6">
      {state?.error ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {clientError ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {clientError}
        </p>
      ) : null}
      {clientMessage ? (
        <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {clientMessage}
        </p>
      ) : null}

      <div className="grid gap-4 rounded-3xl border border-border bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Buscar decks</label>
            <input
              suppressHydrationWarning
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              placeholder="Titulo, nivel o tema"
            />
          </div>
          <p className="text-sm text-muted">
            Crea decks por nivel y tema para que el estudiante practique decks reales en vez de una lista suelta de tarjetas.
          </p>
        </div>
        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Decks</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{decks.length}</p>
          <p className="text-sm text-muted">deck(s) del sistema</p>
          <button
            suppressHydrationWarning
            type="button"
            onClick={openCreate}
            className="mt-5 inline-flex w-full justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
          >
            Nuevo deck
          </button>
        </div>
      </div>

      {filteredDecks.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredDecks.map((deck) => (
            <article key={deck.id} className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
              {deck.coverImageUrl ? (
                <div
                  className="mb-4 h-32 rounded-[20px] bg-cover bg-center"
                  style={{ backgroundImage: `linear-gradient(180deg, rgba(16,52,116,0.08), rgba(16,52,116,0.18)), url("${deck.coverImageUrl}")` }}
                />
              ) : null}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-foreground">{deck.title || "Deck sin titulo"}</p>
                  <p className="mt-1 text-sm text-muted">{deck.description || "Sin descripcion"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${deck.isActive ? "border border-success/25 bg-success/10 text-success" : "border border-border bg-surface-2 text-muted"}`}>
                  {deck.isActive ? "Active" : "Hidden"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  {deck.cefrLevel || "No level"}
                </span>
                {deck.themeTag ? (
                  <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {deck.themeTag.replace(/_/g, " ")}
                  </span>
                ) : null}
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {deck.totalCards || 0} cards
                </span>
              </div>
              {deck.cards?.length ? (
                <p className="mt-4 text-sm text-muted">
                  {deck.cards.slice(0, 3).map((card) => card.word).join(", ")}
                  {deck.cards.length > 3 ? "..." : ""}
                </p>
              ) : null}
              <div className="mt-5 flex gap-2">
                <button
                  suppressHydrationWarning
                  type="button"
                  onClick={() => openEdit(deck)}
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Editar
                </button>
                <button
                  suppressHydrationWarning
                  type="button"
                  onClick={() => handleDelete(deck.id)}
                  disabled={deletingId === deck.id}
                  className="flex-1 rounded-xl border border-danger/45 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingId === deck.id ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-foreground">No hay decks para mostrar</p>
          <p className="mt-2 text-sm text-muted">
            Crea decks por nivel para que los estudiantes practiquen una coleccion clara y reutilizable.
          </p>
        </div>
      )}

      <AppModal open={modalOpen} onClose={() => !pending && setModalOpen(false)} title={formValues.deckId ? "Editar deck" : "Nuevo deck"}>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="deckId" value={formValues.deckId} />
          <input type="hidden" name="cardIdsJson" value={JSON.stringify(formValues.cardIds)} />
          <input type="hidden" name="isActive" value={formValues.isActive ? "true" : "false"} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Titulo</span>
              <input
                name="title"
                value={formValues.title}
                onChange={(event) => setFormValues((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="A1 Introductions"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Nivel CEFR</span>
              <select
                name="cefrLevel"
                value={formValues.cefrLevel}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    cefrLevel: event.target.value,
                    cardIds: current.cardIds.filter((cardId) => {
                      const card = cards.find((entry) => entry.id === cardId);
                      return !card?.cefrLevel || card.cefrLevel === event.target.value;
                    }),
                  }))
                }
                className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              >
                {STUDENT_CEFR_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Tema</span>
              <input
                name="themeTag"
                value={formValues.themeTag}
                onChange={(event) => setFormValues((current) => ({ ...current, themeTag: normalizeThemeTag(event.target.value) }))}
                className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="introductions"
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Descripcion</span>
              <textarea
                name="description"
                value={formValues.description}
                onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))}
                className="min-h-[96px] w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="Deck principal para presentaciones, saludos y vocabulario base."
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">URL de imagen</span>
              <input
                name="coverImageUrl"
                value={formValues.coverImageUrl}
                onChange={(event) => setFormValues((current) => ({ ...current, coverImageUrl: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="https://..."
              />
            </label>
          </div>

          {formValues.coverImageUrl ? (
            <div
              className="h-40 rounded-2xl border border-border bg-cover bg-center"
              style={{ backgroundImage: `linear-gradient(180deg, rgba(16,52,116,0.06), rgba(16,52,116,0.16)), url("${formValues.coverImageUrl}")` }}
            />
          ) : null}

          <label className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={formValues.isActive}
              onChange={(event) => setFormValues((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Visible para estudiantes
          </label>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Biblioteca filtrada</p>
                  <p className="text-xs text-muted">Solo se muestran tarjetas del mismo nivel o sin nivel.</p>
                </div>
                <span className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  {formValues.cefrLevel}
                </span>
              </div>
              <input
                value={cardQuery}
                onChange={(event) => setCardQuery(event.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="Buscar palabra, significado o tema"
              />
              <div className="max-h-[320px] space-y-2 overflow-y-auto">
                {filteredCards.map((card) => {
                  const selected = formValues.cardIds.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => (selected ? removeCard(card.id) : addCard(card.id))}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition ${selected ? "border-primary/30 bg-primary/5" : "border-border bg-surface-2 hover:border-primary/20"}`}
                    >
                      <div>
                        <p className="font-semibold text-foreground">{card.word}</p>
                        <p className="text-xs text-muted">{card.meaning}</p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                        {selected ? "Selected" : card.cefrLevel || "Open"}
                      </span>
                    </button>
                  );
                })}
                {!filteredCards.length ? (
                  <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                    No hay flashcards disponibles para este filtro.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Deck seleccionado</p>
                <p className="text-xs text-muted">Ordena las tarjetas como saldran en el deck.</p>
              </div>
              <div className="max-h-[368px] space-y-2 overflow-y-auto">
                {selectedCards.map((card, index) => (
                  <div key={card.id} className="rounded-2xl border border-border bg-surface-2 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{index + 1}. {card.word}</p>
                        <p className="text-xs text-muted">{card.meaning}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFormValues((current) => ({ ...current, cardIds: moveInList(current.cardIds, index, "up") }))}
                          className="rounded-xl border border-border px-2 py-1 text-xs font-semibold text-foreground"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormValues((current) => ({ ...current, cardIds: moveInList(current.cardIds, index, "down") }))}
                          className="rounded-xl border border-border px-2 py-1 text-xs font-semibold text-foreground"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCard(card.id)}
                          className="rounded-xl border border-danger/35 px-2 py-1 text-xs font-semibold text-danger"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!selectedCards.length ? (
                  <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                    Agrega al menos una flashcard para construir el deck.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-foreground"
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:opacity-60"
            >
              {pending ? "Guardando..." : formValues.deckId ? "Guardar deck" : "Crear deck"}
            </button>
          </div>
        </form>
      </AppModal>
    </div>
  );
}
