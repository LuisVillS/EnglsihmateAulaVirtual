"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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
  return `flashcard-local-${localCounter}`;
}

function createDraft(card = {}) {
  return {
    localId: nextLocalId(),
    id: String(card?.id || "").trim(),
    word: String(card?.word || "").trim(),
    meaning: String(card?.meaning || "").trim(),
    image: String(card?.image || "").trim(),
    acceptedAnswers: Array.isArray(card?.acceptedAnswers)
      ? card.acceptedAnswers.join(", ")
      : String(card?.acceptedAnswers || "").trim(),
  };
}

function toDraftList(cards = []) {
  return Array.isArray(cards) ? cards.map((card) => createDraft(card)) : [];
}

function normalizeAcceptedAnswers(rawValue) {
  return Array.from(
    new Set(
      String(rawValue || "")
        .split(/[\r\n,|]+/)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function parseBulkRows(rawValue) {
  return String(rawValue || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes("|") ? line.split("|") : line.split("\t");
      const [word, meaning] = parts;
      return {
        word: String(word || "").trim(),
        meaning: String(meaning || "").trim(),
      };
    })
    .filter((row) => row.word || row.meaning);
}

function moveItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return list;
  next.splice(toIndex, 0, moved);
  return next;
}

export default function SessionFlashcardsEditor({
  scope = "commission",
  commissionId = "",
  sessionId = "",
  templateId = "",
  templateSessionId = "",
  initialTitle = "Flashcards",
  initialCards = [],
}) {
  const submitAction = scope === "template" ? saveTemplateSessionFlashcardsBatch : saveSessionFlashcardsBatch;
  const [state, formAction, pending] = useActionState(submitAction, INITIAL_STATE);
  const [materialTitle, setMaterialTitle] = useState(() => String(initialTitle || "Flashcards").trim() || "Flashcards");
  const [cards, setCards] = useState(() => toDraftList(initialCards));
  const [bulkInput, setBulkInput] = useState("");
  const [clientNotice, setClientNotice] = useState("");
  const [clientError, setClientError] = useState("");
  const [draggedLocalId, setDraggedLocalId] = useState("");
  const [uploadingLocalId, setUploadingLocalId] = useState("");

  useEffect(() => {
    if (!Array.isArray(state?.cards)) return;
    setCards(toDraftList(state.cards));
    if (state?.materialTitle) {
      setMaterialTitle(String(state.materialTitle || "").trim() || "Flashcards");
    }
  }, [state]);

  const serializedCards = useMemo(
    () =>
      JSON.stringify(
        cards.map((card, index) => ({
          id: card.id,
          word: card.word,
          meaning: card.meaning,
          image: card.image,
          order: index + 1,
          acceptedAnswers: normalizeAcceptedAnswers(card.acceptedAnswers),
        }))
      ),
    [cards]
  );

  function updateCard(localId, patch) {
    setCards((previous) =>
      previous.map((card) => (card.localId === localId ? { ...card, ...patch } : card))
    );
  }

  function addCard() {
    setClientError("");
    setClientNotice("");
    setCards((previous) => [
      ...previous,
      createDraft({ word: "", meaning: "", image: "", acceptedAnswers: [] }),
    ]);
  }

  function removeCard(localId) {
    setClientError("");
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

  function handleBulkAdd() {
    const rows = parseBulkRows(bulkInput);
    if (!rows.length) {
      setClientError("Agrega lineas con el formato word | meaning.");
      setClientNotice("");
      return;
    }

    setCards((previous) => [
      ...previous,
      ...rows.map((row) =>
        createDraft({
          word: row.word,
          meaning: row.meaning,
          image: "",
          acceptedAnswers: [],
        })
      ),
    ]);
    setBulkInput("");
    setClientError("");
    setClientNotice(`${rows.length} flashcard(s) agregadas al editor.`);
  }

  async function handleUpload(localId, file) {
    if (!file) return;

    setUploadingLocalId(localId);
    setClientError("");
    setClientNotice("");

    try {
      const signResponse = await fetch("/api/r2/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "image/png",
          visibility: "public",
          folder: "images",
        }),
      });

      if (!signResponse.ok) {
        throw new Error("No se pudo obtener la URL firmada para la imagen.");
      }

      const signData = await signResponse.json();
      const uploadResponse = await fetch(signData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "image/png",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("El upload de la imagen fallo.");
      }

      if (!signData.publicUrl) {
        throw new Error("No se recibio la URL publica de la imagen.");
      }

      updateCard(localId, { image: signData.publicUrl });
      setClientNotice("Imagen subida y asignada a la flashcard.");
    } catch (error) {
      setClientError(error?.message || "No se pudo subir la imagen.");
    } finally {
      setUploadingLocalId("");
    }
  }

  function handleDragStart(localId) {
    setDraggedLocalId(localId);
  }

  function handleDrop(targetLocalId) {
    if (!draggedLocalId || draggedLocalId === targetLocalId) {
      setDraggedLocalId("");
      return;
    }

    setCards((previous) => {
      const fromIndex = previous.findIndex((card) => card.localId === draggedLocalId);
      const toIndex = previous.findIndex((card) => card.localId === targetLocalId);
      return moveItem(previous, fromIndex, toIndex);
    });
    setDraggedLocalId("");
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
      {clientError ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {clientError}
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

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Carga rapida (opcional)
              </label>
              <textarea
                rows={4}
                value={bulkInput}
                onChange={(event) => setBulkInput(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder={"dog | perro\ncat | gato"}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleBulkAdd}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Agregar lote
                </button>
                <button
                  type="button"
                  onClick={addCard}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Nueva flashcard
                </button>
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
            <p className="text-sm text-muted">flashcard(s) en este set</p>
            <p className="mt-4 text-xs text-muted">
              Si vacias la lista y guardas, el material Flashcards se elimina de la clase.
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
              draggable
              onDragStart={() => handleDragStart(card.localId)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(card.localId)}
              className="rounded-3xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                    #{index + 1}
                  </span>
                  <span className="rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                    Arrastra para reordenar
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
                    Eliminar
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted">Word</label>
                    <input
                      value={card.word}
                      onChange={(event) => updateCard(card.localId, { word: event.target.value })}
                      className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                      placeholder="dog"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted">Meaning</label>
                    <input
                      value={card.meaning}
                      onChange={(event) => updateCard(card.localId, { meaning: event.target.value })}
                      className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                      placeholder="perro"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Imagen (URL)
                    </label>
                    <input
                      value={card.image}
                      onChange={(event) => updateCard(card.localId, { image: event.target.value })}
                      className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Variantes aceptadas (opcional)
                    </label>
                    <input
                      value={card.acceptedAnswers}
                      onChange={(event) => updateCard(card.localId, { acceptedAnswers: event.target.value })}
                      className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                      placeholder="doggo, puppy"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="inline-flex cursor-pointer items-center rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-3 text-sm font-medium text-foreground">
                      {uploadingLocalId === card.localId ? "Subiendo imagen..." : "Subir imagen"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingLocalId === card.localId}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          handleUpload(card.localId, file);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-3 rounded-3xl border border-border bg-surface-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Preview</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                      <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Front
                      </div>
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
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                      <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Back
                      </div>
                      <div className="flex min-h-36 flex-col justify-center gap-2 px-4 py-4 text-center">
                        <p className="text-lg font-semibold text-foreground">{card.word || "Word"}</p>
                        <p className="text-sm text-muted">{card.meaning || "Meaning"}</p>
                      </div>
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
            Agrega una tarjeta manualmente o pega varias lineas con el formato word | meaning.
          </p>
        </div>
      )}
    </div>
  );
}
