"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import AppModal from "@/components/app-modal";
import {
  saveSessionFlashcardsBatch,
  saveTemplateSessionFlashcardsBatch,
} from "@/app/admin/actions";

const INITIAL_STATE = {
  success: false,
  message: null,
  error: null,
  cards: null,
  materialTitle: null,
};

let localCounter = 0;

function nextLocalId() {
  localCounter += 1;
  return `flashcard-link-${localCounter}`;
}

function createDraft(card = {}) {
  const legacyId = String(card?.legacyId || "").trim();
  const explicitFlashcardId = String(card?.flashcardId || "").trim();
  return {
    localId: nextLocalId(),
    id: String(card?.id || "").trim(),
    legacyId,
    flashcardId: explicitFlashcardId || (!legacyId ? String(card?.id || "").trim() : ""),
    word: String(card?.word || "").trim(),
    meaning: String(card?.meaning || "").trim(),
    image: String(card?.image || "").trim(),
    acceptedAnswers: Array.isArray(card?.acceptedAnswers) ? card.acceptedAnswers : [],
    audioUrl: String(card?.audioUrl || "").trim(),
    audioR2Key: String(card?.audioR2Key || "").trim(),
    audioProvider: String(card?.audioProvider || "elevenlabs").trim() || "elevenlabs",
    voiceId: String(card?.voiceId || "").trim(),
    elevenLabsConfig: card?.elevenLabsConfig && typeof card.elevenLabsConfig === "object" ? card.elevenLabsConfig : null,
  };
}

function toDraftList(cards = []) {
  return Array.isArray(cards) ? cards.map((card) => createDraft(card)) : [];
}

function moveItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return list;
  next.splice(toIndex, 0, moved);
  return next;
}

function matchesSearch(card, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [card?.word, card?.meaning]
    .map((value) => String(value || "").toLowerCase())
    .some((value) => value.includes(needle));
}

function buildCardSignature(card) {
  return [
    String(card?.word || "").trim().toLowerCase(),
    String(card?.meaning || "").trim().toLowerCase(),
    String(card?.image || "").trim(),
  ].join("::");
}

export default function SessionFlashcardsEditor({
  scope = "commission",
  commissionId = "",
  sessionId = "",
  templateId = "",
  templateSessionId = "",
  initialTitle = "Flashcards",
  initialCards = [],
  libraryCards = [],
  libraryError = "",
}) {
  const submitAction = scope === "template" ? saveTemplateSessionFlashcardsBatch : saveSessionFlashcardsBatch;
  const [state, formAction, pending] = useActionState(submitAction, INITIAL_STATE);
  const [materialTitle, setMaterialTitle] = useState(() => String(initialTitle || "Flashcards").trim() || "Flashcards");
  const [cards, setCards] = useState(() => toDraftList(initialCards));
  const [clientNotice, setClientNotice] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSelection, setPickerSelection] = useState([]);

  useEffect(() => {
    if (!Array.isArray(state?.cards)) return;
    startTransition(() => {
      setCards(toDraftList(state.cards));
      if (state?.materialTitle) {
        setMaterialTitle(String(state.materialTitle || "").trim() || "Flashcards");
      }
    });
  }, [state]);

  const selectedIds = useMemo(
    () => new Set(cards.map((card) => String(card.flashcardId || "").trim()).filter(Boolean)),
    [cards]
  );
  const selectedSignatures = useMemo(
    () => new Set(cards.map((card) => buildCardSignature(card)).filter((value) => value !== "::::")),
    [cards]
  );

  const serializedCards = useMemo(
    () =>
      JSON.stringify(
        cards.map((card, index) => ({
          id: card.id,
          legacyId: card.legacyId,
          flashcardId: card.flashcardId,
          word: card.word,
          meaning: card.meaning,
          image: card.image,
          order: index + 1,
          acceptedAnswers: card.acceptedAnswers,
          audioUrl: card.audioUrl,
          audioR2Key: card.audioR2Key,
          audioProvider: card.audioProvider,
          voiceId: card.voiceId,
          elevenLabsConfig: card.elevenLabsConfig,
        }))
      ),
    [cards]
  );

  const filteredLibraryCards = useMemo(
    () => (Array.isArray(libraryCards) ? libraryCards.filter((card) => matchesSearch(card, pickerQuery)) : []),
    [libraryCards, pickerQuery]
  );

  function removeCard(localId) {
    setClientNotice("");
    setCards((previous) => previous.filter((card) => card.localId !== localId));
  }

  function moveCardByOffset(localId, direction) {
    setCards((previous) => {
      const currentIndex = previous.findIndex((card) => card.localId === localId);
      if (currentIndex === -1) return previous;
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= previous.length) return previous;
      return moveItem(previous, currentIndex, targetIndex);
    });
  }

  function openPicker() {
    setPickerSelection([]);
    setPickerQuery("");
    setPickerOpen(true);
  }

  function togglePickerSelection(flashcardId) {
    setPickerSelection((previous) => {
      const value = String(flashcardId || "").trim();
      if (!value) return previous;
      if (previous.includes(value)) {
        return previous.filter((item) => item !== value);
      }
      return [...previous, value];
    });
  }

  function confirmPickerSelection() {
    const selectedLibraryRows = (libraryCards || []).filter((card) => pickerSelection.includes(String(card.id || "").trim()));
    if (!selectedLibraryRows.length) {
      setPickerOpen(false);
      return;
    }

    const nextCards = selectedLibraryRows
      .filter((card) => {
        const flashcardId = String(card.id || "").trim();
        return !selectedIds.has(flashcardId) && !selectedSignatures.has(buildCardSignature(card));
      })
      .map((card) => createDraft(card));

    if (!nextCards.length) {
      setClientNotice("Las flashcards seleccionadas ya estaban agregadas.");
      setPickerOpen(false);
      return;
    }

    setCards((previous) => [...previous, ...nextCards]);
    setClientNotice(`${nextCards.length} flashcard(s) agregadas desde la biblioteca.`);
    setPickerOpen(false);
  }

  return (
    <div className="space-y-6">
      {state?.error ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {state.message}
        </p>
      ) : null}
      {libraryError ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {libraryError}
        </p>
      ) : null}
      {clientNotice ? (
        <p className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {clientNotice}
        </p>
      ) : null}

      <form action={formAction} className="space-y-6">
        <input suppressHydrationWarning readOnly type="hidden" name="commissionId" value={commissionId} />
        <input suppressHydrationWarning readOnly type="hidden" name="sessionId" value={sessionId} />
        <input suppressHydrationWarning readOnly type="hidden" name="templateId" value={templateId} />
        <input suppressHydrationWarning readOnly type="hidden" name="templateSessionId" value={templateSessionId} />
        <input suppressHydrationWarning readOnly type="hidden" name="batchJson" value={serializedCards} />

        <div className="grid gap-4 rounded-3xl border border-border bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Titulo del material
              </label>
              <input
                name="materialTitle"
                value={materialTitle}
                onChange={(event) => setMaterialTitle(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="Flashcards"
                required
              />
            </div>

            <div className="rounded-2xl border border-border bg-surface-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Biblioteca</p>
              <p className="mt-2 text-sm text-muted">
                Agrega flashcards ya registrados y guárdalos como referencias para esta clase.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openPicker}
                  disabled={!libraryCards.length}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Agregar flashcards
                </button>
                <Link
                  href="/admin/flashcards"
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                >
                  Abrir biblioteca
                </Link>
                <button
                  type="button"
                  onClick={() => setCards([])}
                  className="rounded-xl border border-danger/45 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10"
                >
                  Vaciar editor
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Resumen</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{cards.length}</p>
            <p className="text-sm text-muted">flashcard(s) asignadas a este set</p>
            <p className="mt-4 text-xs text-muted">
              Al guardar, la clase conserva solo referencias a la biblioteca central.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="mt-5 inline-flex w-full justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? "Guardando..." : "Guardar flashcards"}
            </button>
          </div>
        </div>
      </form>

      {cards.length ? (
        <div className="space-y-4">
          {cards.map((card, index) => (
            <section
              key={card.localId}
              className="rounded-3xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                    #{index + 1}
                  </span>
                  <span className="rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                    {card.flashcardId ? "Biblioteca central" : "Legacy pendiente de migrar"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moveCardByOffset(card.localId, -1)}
                    disabled={index === 0}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCardByOffset(card.localId, 1)}
                    disabled={index === cards.length - 1}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Bajar
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCard(card.localId)}
                    className="rounded-xl border border-danger/45 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10"
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-3 rounded-3xl border border-border bg-surface-2 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Word</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{card.word || "Sin word"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Meaning</p>
                    <p className="mt-1 text-sm text-muted">{card.meaning || "Sin meaning"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Variantes aceptadas</p>
                    <p className="mt-1 text-sm text-muted">
                      {card.acceptedAnswers.length ? card.acceptedAnswers.join(", ") : "Sin variantes extra"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Audio</p>
                    <p className="mt-1 text-sm text-muted">
                      {card.audioUrl
                        ? `Audio guardado (${card.audioProvider || "elevenlabs"})`
                        : "Sin audio registrado"}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 rounded-3xl border border-border bg-surface-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Preview</p>
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                    <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 p-3">
                      {card.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.image}
                          alt={card.word || "Flashcard image"}
                          className="h-full w-full rounded-xl object-contain"
                        />
                      ) : (
                        <span className="text-xs text-muted">Sin imagen</span>
                      )}
                    </div>
                    <div className="border-t border-border px-4 py-3 text-center">
                      <p className="text-base font-semibold text-foreground">{card.word || "Word"}</p>
                      <p className="text-sm text-muted">{card.meaning || "Meaning"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-foreground">No hay flashcards en el editor</p>
          <p className="mt-2 text-sm text-muted">
            Usa el selector para agregar tarjetas desde la biblioteca central.
          </p>
        </div>
      )}

      <AppModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Agregar flashcards"
        widthClass="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Biblioteca central</p>
              <p className="text-xs text-muted">
                Busca y selecciona varias tarjetas para agregarlas a esta clase.
              </p>
            </div>
            <div className="text-xs font-semibold text-muted">
              Seleccionadas: {pickerSelection.length}
            </div>
          </div>

          <input
            value={pickerQuery}
            onChange={(event) => setPickerQuery(event.target.value)}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
            placeholder="Buscar por word o meaning"
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredLibraryCards.map((card) => {
              const flashcardId = String(card.id || "").trim();
              const selected = pickerSelection.includes(flashcardId);
              const alreadyAdded =
                selectedIds.has(flashcardId) || selectedSignatures.has(buildCardSignature(card));

              return (
                <button
                  key={flashcardId}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => togglePickerSelection(flashcardId)}
                  className={`overflow-hidden rounded-3xl border text-left transition ${
                    alreadyAdded
                      ? "cursor-not-allowed border-border bg-surface opacity-55"
                      : selected
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-surface hover:border-primary/35 hover:bg-surface-2"
                  }`}
                >
                  <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 p-3">
                    {card.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.image}
                        alt={card.word || "Flashcard image"}
                        className="h-full w-full rounded-2xl object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted">Sin imagen</span>
                    )}
                  </div>
                  <div className="space-y-1 border-t border-border px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{card.word || "Sin word"}</p>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {alreadyAdded ? "Ya agregado" : selected ? "Listo" : "Agregar"}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{card.meaning || "Sin meaning"}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {!filteredLibraryCards.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-6 text-center text-sm text-muted">
              No hay resultados para esa búsqueda.
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmPickerSelection}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              Agregar seleccionadas
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
