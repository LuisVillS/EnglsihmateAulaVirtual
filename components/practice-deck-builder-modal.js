"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import AppModal from "@/components/app-modal";
import { upsertStudentFlashcardDeckAction } from "@/app/app/practice/decks/actions";
import { STUDENT_CEFR_LEVELS } from "@/lib/student-levels";

const INITIAL_STATE = {
  success: false,
  error: null,
  message: null,
  decks: [],
  recommendedDeck: null,
  savedDeckKey: "",
};

function normalizeThemeTag(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function moveInList(list = [], index, direction) {
  const next = [...list];
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

function createEmptyDeck(studentLevel) {
  return {
    deckId: "",
    title: "",
    description: "",
    cefrLevel: studentLevel || "A1",
    themeTag: "",
    cardIds: [],
  };
}

function buildInitialDeckValues(initialDeck, studentLevel) {
  if (!initialDeck) {
    return createEmptyDeck(studentLevel);
  }

  return {
    deckId: String(initialDeck?.deckId || initialDeck?.id || "").trim(),
    title: String(initialDeck?.title || "").trim(),
    description: String(initialDeck?.description || "").trim(),
    cefrLevel: String(initialDeck?.cefrLevel || studentLevel || "A1").trim().toUpperCase() || "A1",
    themeTag: String(initialDeck?.themeTag || "").trim().toLowerCase(),
    cardIds: (Array.isArray(initialDeck?.cards) ? initialDeck.cards : [])
      .map((card) => String(card?.flashcardId || card?.id || "").trim())
      .filter(Boolean),
  };
}

function buildCopy(language) {
  if (language === "en") {
    return {
      titleNew: "Create Deck",
      titleEdit: "Edit Deck",
      titleLabel: "Deck title",
      titlePlaceholder: "Travel phrases",
      descriptionLabel: "Description",
      descriptionPlaceholder: "Review the expressions I want to practice this week.",
      levelLabel: "CEFR level",
      themeLabel: "Topic",
      themePlaceholder: "travel",
      libraryTitle: "Available flashcards",
      libraryBody: "Only cards matching the selected level are shown.",
      librarySearch: "Search word, meaning, or topic",
      selectedTitle: "Selected cards",
      selectedBody: "Reorder them to control the study flow.",
      saveCreate: "Create deck",
      saveEdit: "Save deck",
      cancel: "Cancel",
      add: "Add",
      remove: "Remove",
      up: "Up",
      down: "Down",
      emptyLibrary: "No flashcards match this filter.",
      emptySelected: "Add at least one flashcard to build your deck.",
    };
  }

  return {
    titleNew: "Crear Deck",
    titleEdit: "Editar Deck",
    titleLabel: "Titulo del deck",
    titlePlaceholder: "Frases de viaje",
    descriptionLabel: "Descripcion",
    descriptionPlaceholder: "Repaso de las expresiones que quiero practicar esta semana.",
    levelLabel: "Nivel CEFR",
    themeLabel: "Tema",
    themePlaceholder: "travel",
    libraryTitle: "Flashcards disponibles",
    libraryBody: "Solo se muestran tarjetas del nivel seleccionado o sin nivel.",
    librarySearch: "Buscar palabra, significado o tema",
    selectedTitle: "Tarjetas seleccionadas",
    selectedBody: "Reordena las tarjetas para definir el flujo del deck.",
    saveCreate: "Crear deck",
    saveEdit: "Guardar deck",
    cancel: "Cancelar",
    add: "Agregar",
    remove: "Quitar",
    up: "Subir",
    down: "Bajar",
    emptyLibrary: "No hay flashcards para este filtro.",
    emptySelected: "Agrega al menos una flashcard para construir tu deck.",
  };
}

export default function PracticeDeckBuilderModal({
  open,
  onClose,
  onSaved,
  initialDeck = null,
  availableCards = [],
  studentLevel = "",
  language = "es",
}) {
  const copy = buildCopy(language);
  const [state, formAction, pending] = useActionState(upsertStudentFlashcardDeckAction, INITIAL_STATE);
  const [formValues, setFormValues] = useState(() => buildInitialDeckValues(initialDeck, studentLevel));
  const [cardQuery, setCardQuery] = useState("");
  const [clientError, setClientError] = useState("");
  const levelOptions = studentLevel ? [studentLevel] : STUDENT_CEFR_LEVELS;

  useEffect(() => {
    if (!state?.success) return;
    onSaved?.(state);
  }, [onSaved, state]);

  const availableById = useMemo(
    () => new Map((Array.isArray(availableCards) ? availableCards : []).map((card) => [String(card?.id || "").trim(), card])),
    [availableCards]
  );

  const filteredCards = useMemo(() => {
    const needle = String(cardQuery || "").trim().toLowerCase();
    return (Array.isArray(availableCards) ? availableCards : []).filter((card) => {
      const cardLevel = String(card?.cefrLevel || "").trim().toUpperCase();
      if (cardLevel && cardLevel !== formValues.cefrLevel) {
        return false;
      }
      if (!needle) return true;
      return [card?.word, card?.meaning, card?.themeTag]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(needle));
    });
  }, [availableCards, cardQuery, formValues.cefrLevel]);

  const selectedCards = useMemo(
    () =>
      formValues.cardIds
        .map((cardId) => availableById.get(cardId))
        .filter(Boolean),
    [availableById, formValues.cardIds]
  );

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

  return (
    <AppModal
      open={open}
      onClose={() => {
        if (!pending) onClose?.();
      }}
      title={formValues.deckId ? copy.titleEdit : copy.titleNew}
      widthClass="max-w-6xl"
    >
      <form
        action={formAction}
        className="space-y-5"
        onSubmit={(event) => {
          if (!formValues.cardIds.length) {
            event.preventDefault();
            setClientError(copy.emptySelected);
          }
        }}
      >
        <input type="hidden" name="deckId" value={formValues.deckId} />
        <input type="hidden" name="cardIdsJson" value={JSON.stringify(formValues.cardIds)} />

        {state?.error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {state.error}
          </div>
        ) : null}
        {clientError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {clientError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.titleLabel}</span>
            <input
              name="title"
              value={formValues.title}
              onChange={(event) => setFormValues((current) => ({ ...current, title: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder={copy.titlePlaceholder}
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.levelLabel}</span>
            <select
              name="cefrLevel"
              value={formValues.cefrLevel}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  cefrLevel: event.target.value,
                  cardIds: current.cardIds.filter((cardId) => {
                    const card = availableById.get(cardId);
                    const cardLevel = String(card?.cefrLevel || "").trim().toUpperCase();
                    return !cardLevel || cardLevel === event.target.value;
                  }),
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
            >
              {levelOptions.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.themeLabel}</span>
            <input
              name="themeTag"
              value={formValues.themeTag}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, themeTag: normalizeThemeTag(event.target.value) }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder={copy.themePlaceholder}
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.descriptionLabel}</span>
            <textarea
              name="description"
              value={formValues.description}
              onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))}
              className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder={copy.descriptionPlaceholder}
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{copy.libraryTitle}</p>
              <p className="text-xs text-slate-500">{copy.libraryBody}</p>
            </div>
            <input
              value={cardQuery}
              onChange={(event) => setCardQuery(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
              placeholder={copy.librarySearch}
            />
            <div className="max-h-[360px] space-y-2 overflow-y-auto">
              {filteredCards.map((card) => {
                const selected = formValues.cardIds.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      setClientError("");
                      if (selected) {
                        removeCard(card.id);
                      } else {
                        addCard(card.id);
                      }
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      selected ? "border-[#002a5c]/20 bg-[#eef4ff]" : "border-slate-200 bg-slate-50 hover:border-[#002a5c]/20"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{card.word}</p>
                      <p className="truncate text-xs text-slate-500">{card.meaning}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {selected ? copy.remove : copy.add}
                    </span>
                  </button>
                );
              })}
              {!filteredCards.length ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                  {copy.emptyLibrary}
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{copy.selectedTitle}</p>
              <p className="text-xs text-slate-500">{copy.selectedBody}</p>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {selectedCards.map((card, index) => (
                <div key={card.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {index + 1}. {card.word}
                      </p>
                      <p className="truncate text-xs text-slate-500">{card.meaning}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFormValues((current) => ({
                            ...current,
                            cardIds: moveInList(current.cardIds, index, "up"),
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        {copy.up}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormValues((current) => ({
                            ...current,
                            cardIds: moveInList(current.cardIds, index, "down"),
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        {copy.down}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCard(card.id)}
                        className="rounded-xl border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600"
                      >
                        {copy.remove}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!selectedCards.length ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                  {copy.emptySelected}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              if (!pending) onClose?.();
            }}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
            disabled={pending}
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-2xl bg-[#002a5c] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            {pending ? "..." : formValues.deckId ? copy.saveEdit : copy.saveCreate}
          </button>
        </div>
      </form>
    </AppModal>
  );
}
