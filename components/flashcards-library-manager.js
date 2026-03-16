"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import AppModal from "@/components/app-modal";
import {
  deleteFlashcardLibraryEntry,
  upsertFlashcardLibraryEntry,
} from "@/app/admin/actions";

const INITIAL_FORM_STATE = {
  success: false,
  error: null,
  message: null,
  flashcard: null,
};

function createEmptyForm() {
  return {
    flashcardId: "",
    word: "",
    meaning: "",
    image: "",
    acceptedAnswers: "",
    audioUrl: "",
    audioR2Key: "",
    audioProvider: "elevenlabs",
    voiceId: "",
    elevenLabsConfig: "",
  };
}

function toFormValues(card = null) {
  if (!card) return createEmptyForm();
  return {
    flashcardId: String(card.id || "").trim(),
    word: String(card.word || "").trim(),
    meaning: String(card.meaning || "").trim(),
    image: String(card.image || "").trim(),
    acceptedAnswers: Array.isArray(card.acceptedAnswers) ? card.acceptedAnswers.join(", ") : "",
    audioUrl: String(card.audioUrl || "").trim(),
    audioR2Key: String(card.audioR2Key || "").trim(),
    audioProvider: String(card.audioProvider || "elevenlabs").trim() || "elevenlabs",
    voiceId: String(card.voiceId || "").trim(),
    elevenLabsConfig: card.elevenLabsConfig ? JSON.stringify(card.elevenLabsConfig, null, 2) : "",
  };
}

function matchesSearch(card, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [card?.word, card?.meaning]
    .map((value) => String(value || "").toLowerCase())
    .some((value) => value.includes(needle));
}

function sortCards(list = []) {
  return [...list].sort((left, right) => {
    const wordCompare = String(left?.word || "").localeCompare(String(right?.word || ""), "es", { sensitivity: "base" });
    if (wordCompare !== 0) return wordCompare;
    return String(left?.meaning || "").localeCompare(String(right?.meaning || ""), "es", { sensitivity: "base" });
  });
}

export default function FlashcardsLibraryManager({ initialCards = [] }) {
  const [state, formAction, pending] = useActionState(upsertFlashcardLibraryEntry, INITIAL_FORM_STATE);
  const [cards, setCards] = useState(() => sortCards(initialCards));
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [formValues, setFormValues] = useState(() => createEmptyForm());
  const [clientError, setClientError] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [generatingAudio, setGeneratingAudio] = useState(false);

  useEffect(() => {
    if (!state?.flashcard) return;
    const saved = state.flashcard;
    startTransition(() => {
      setCards((previous) => {
        const exists = previous.some((card) => String(card.id || "") === String(saved.id || ""));
        const next = exists
          ? previous.map((card) => (String(card.id || "") === String(saved.id || "") ? saved : card))
          : [...previous, saved];
        return sortCards(next);
      });
      setClientError("");
      setClientMessage(state.message || "");
      setModalOpen(false);
      setFormValues(createEmptyForm());
    });
  }, [state]);

  const filteredCards = useMemo(
    () => cards.filter((card) => matchesSearch(card, query)),
    [cards, query]
  );

  function openCreate() {
    setClientError("");
    setClientMessage("");
    setFormValues(createEmptyForm());
    setModalOpen(true);
  }

  function openEdit(card) {
    setClientError("");
    setClientMessage("");
    setFormValues(toFormValues(card));
    setModalOpen(true);
  }

  async function handleUpload(file) {
    if (!file) return;

    setUploading(true);
    setClientError("");
    setClientMessage("");

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

      if (!uploadResponse.ok || !signData.publicUrl) {
        throw new Error("El upload de la imagen fallo.");
      }

      setFormValues((previous) => ({ ...previous, image: signData.publicUrl }));
      setClientMessage("Imagen subida correctamente.");
    } catch (error) {
      setClientError(error?.message || "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  function handleDelete(flashcardId) {
    if (!flashcardId || deletingId) return;

    setDeletingId(flashcardId);
    setClientError("");
    setClientMessage("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("flashcardId", flashcardId);
      try {
        const result = await deleteFlashcardLibraryEntry(null, formData);
        if (result?.success) {
          setCards((previous) => previous.filter((card) => String(card.id || "") !== String(flashcardId)));
          setClientMessage(result.message || "Flashcard eliminada.");
        } else {
          setClientError(result?.error || "No se pudo eliminar la flashcard.");
        }
      } catch {
        setClientError("No se pudo eliminar la flashcard.");
      }
      setDeletingId("");
    });
  }

  async function handleGenerateAudio() {
    if (generatingAudio) return;

    const word = String(formValues.word || "").trim();
    if (!word) {
      setClientError("Ingresa la palabra antes de generar audio.");
      setClientMessage("");
      return;
    }

    setGeneratingAudio(true);
    setClientError("");
    setClientMessage("");

    try {
      const response = await fetch("/api/admin/flashcards/audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          flashcardId: formValues.flashcardId || null,
          word,
          voiceId: formValues.voiceId || "",
          elevenLabsConfig: formValues.elevenLabsConfig || "",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo generar audio con ElevenLabs.");
      }

      if (payload?.flashcard) {
        const saved = payload.flashcard;
        setCards((previous) => {
          const next = previous.map((card) =>
            String(card.id || "") === String(saved.id || "") ? saved : card
          );
          return sortCards(next);
        });
        setFormValues(toFormValues(saved));
      } else if (payload?.audio) {
        setFormValues((previous) => ({
          ...previous,
          audioUrl: String(payload.audio.audioUrl || "").trim(),
          audioR2Key: String(payload.audio.audioR2Key || "").trim(),
          audioProvider: String(payload.audio.audioProvider || "elevenlabs").trim() || "elevenlabs",
          voiceId: String(payload.audio.voiceId || previous.voiceId || "").trim(),
          elevenLabsConfig: payload.audio.elevenLabsConfig
            ? JSON.stringify(payload.audio.elevenLabsConfig, null, 2)
            : previous.elevenLabsConfig,
        }));
      }

      setClientMessage(
        payload?.cached
          ? "Audio reutilizado desde la cache de ElevenLabs."
          : "Audio generado con ElevenLabs y guardado en R2."
      );
    } catch (error) {
      setClientError(error?.message || "No se pudo generar audio con ElevenLabs.");
    } finally {
      setGeneratingAudio(false);
    }
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
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Buscar</label>
            <input
              suppressHydrationWarning
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              placeholder="Palabra o significado"
            />
          </div>
          <p className="text-sm text-muted">
            Gestiona el inventario central y reutiliza tarjetas en plantillas y comisiones.
          </p>
        </div>
        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Biblioteca</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{cards.length}</p>
          <p className="text-sm text-muted">tarjeta(s) registradas</p>
          <button
            suppressHydrationWarning
            type="button"
            onClick={openCreate}
            className="mt-5 inline-flex w-full justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
          >
            Nueva flashcard
          </button>
        </div>
      </div>

      {filteredCards.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCards.map((card) => (
            <article key={card.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
              <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 p-4">
                {card.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.image}
                    alt={card.word || "Imagen de flashcard"}
                    className="h-full w-full rounded-2xl object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted">Sin imagen</span>
                )}
              </div>
              <div className="space-y-3 border-t border-border px-5 py-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">{card.word || "Sin palabra"}</p>
                  <p className="text-sm text-muted">{card.meaning || "Sin significado"}</p>
                </div>
                <div className="grid gap-2 text-xs text-muted">
                  <p>
                    Variantes: {card.acceptedAnswers?.length ? card.acceptedAnswers.join(", ") : "Sin extras"}
                  </p>
                  <p>
                    Audio: {card.audioUrl ? `Si (${card.audioProvider || "elevenlabs"})` : "No"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    suppressHydrationWarning
                    type="button"
                    onClick={() => openEdit(card)}
                    className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Editar
                  </button>
                  <button
                    suppressHydrationWarning
                    type="button"
                    onClick={() => handleDelete(card.id)}
                    disabled={deletingId === card.id}
                    className="flex-1 rounded-xl border border-danger/45 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === card.id ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-foreground">No hay flashcards para mostrar</p>
          <p className="mt-2 text-sm text-muted">
            Ajusta la búsqueda o crea una nueva tarjeta en la biblioteca.
          </p>
        </div>
      )}

      <AppModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={formValues.flashcardId ? "Editar flashcard" : "Nueva flashcard"}
        widthClass="max-w-3xl"
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="flashcardId" value={formValues.flashcardId} readOnly />
          <input type="hidden" name="audioR2Key" value={formValues.audioR2Key} readOnly />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Palabra</label>
              <input
                suppressHydrationWarning
                name="word"
                value={formValues.word}
                onChange={(event) => setFormValues((previous) => ({ ...previous, word: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="dog"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Significado</label>
              <input
                suppressHydrationWarning
                name="meaning"
                value={formValues.meaning}
                onChange={(event) => setFormValues((previous) => ({ ...previous, meaning: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="perro"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Imagen (URL)</label>
            <input
              suppressHydrationWarning
              name="image"
              value={formValues.image}
              onChange={(event) => setFormValues((previous) => ({ ...previous, image: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              placeholder="https://..."
              required
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-3 text-sm font-medium text-foreground">
              {uploading ? "Subiendo imagen..." : "Subir imagen"}
              <input
                suppressHydrationWarning
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  handleUpload(file);
                }}
              />
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Variantes aceptadas (opcional)
            </label>
            <input
              suppressHydrationWarning
              name="acceptedAnswers"
              value={formValues.acceptedAnswers}
              onChange={(event) => setFormValues((previous) => ({ ...previous, acceptedAnswers: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              placeholder="doggo, puppy"
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Compatibilidad de audio</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">URL de audio</label>
                <input
                  suppressHydrationWarning
                  name="audioUrl"
                  value={formValues.audioUrl}
                  onChange={(event) => setFormValues((previous) => ({ ...previous, audioUrl: event.target.value }))}
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Voice ID</label>
                <input
                  suppressHydrationWarning
                  name="voiceId"
                  value={formValues.voiceId}
                  onChange={(event) => setFormValues((previous) => ({ ...previous, voiceId: event.target.value }))}
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  placeholder="voice_id"
                />
              </div>
            </div>
            <div className="mt-4">
              <button
                suppressHydrationWarning
                type="button"
                onClick={handleGenerateAudio}
                disabled={generatingAudio}
                className="inline-flex w-full justify-center rounded-2xl border border-primary/35 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generatingAudio ? "Generando audio..." : "Generar audio ElevenLabs"}
              </button>
            </div>
            <div className="mt-4 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Proveedor de audio</label>
              <input
                suppressHydrationWarning
                name="audioProvider"
                value={formValues.audioProvider}
                onChange={(event) => setFormValues((previous) => ({ ...previous, audioProvider: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                placeholder="elevenlabs"
              />
            </div>
            <div className="mt-4 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Configuracion de ElevenLabs (JSON)</label>
              <textarea
                suppressHydrationWarning
                name="elevenLabsConfig"
                rows={4}
                value={formValues.elevenLabsConfig}
                onChange={(event) => setFormValues((previous) => ({ ...previous, elevenLabsConfig: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                placeholder={'{"model_id":"eleven_multilingual_v2"}'}
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              suppressHydrationWarning
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              suppressHydrationWarning
              type="submit"
              disabled={pending}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? "Guardando..." : formValues.flashcardId ? "Guardar cambios" : "Crear tarjeta"}
            </button>
          </div>
        </form>
      </AppModal>
    </div>
  );
}
