"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createTemplateSessionExerciseBatch } from "@/app/admin/actions";

const EXERCISE_TYPE_OPTIONS = [
  { value: "scramble", label: "Scrambled Sentence" },
  { value: "audio_match", label: "Audio Match / Dictation" },
  { value: "image_match", label: "Image-Word Association" },
  { value: "pairs", label: "Pairs Game" },
  { value: "cloze", label: "Cloze Test" },
];

const EXERCISE_STATUS_OPTIONS = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

const INITIAL_STATE = { success: false, message: null, warning: null, error: null, created: 0 };

function toPrettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function safeParseJson(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toLineText(list = []) {
  return list.map((v) => String(v || "").trim()).filter(Boolean).join("\n");
}

function fromLineText(text = "") {
  return text
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDefaultContent(type) {
  switch (type) {
    case "scramble":
      return {
        prompt_native: "Yo soy estudiante",
        target_words: ["I", "am", "a", "student"],
        answer_order: [0, 1, 2, 3],
      };
    case "audio_match":
      return {
        text_target: "How are you?",
        mode: "dictation",
        provider: "elevenlabs",
        audio_url: "",
      };
    case "image_match":
      return {
        question_native: "Cual es 'El Pan'?",
        options: [
          { vocab_id: "", image_url: "" },
          { vocab_id: "", image_url: "" },
          { vocab_id: "", image_url: "" },
          { vocab_id: "", image_url: "" },
        ],
        correct_index: 0,
      };
    case "pairs":
      return {
        pairs: [
          { native: "Manzana", target: "Apple" },
          { native: "Pan", target: "Bread" },
        ],
      };
    case "cloze":
    default:
      return {
        sentence: "I ____ a student.",
        options: ["am", "are", "is", "be"],
        correct_index: 0,
      };
  }
}

function normalizeContent(type, rawObject) {
  const base = getDefaultContent(type);
  const raw = rawObject && typeof rawObject === "object" ? rawObject : {};

  if (type === "cloze") {
    const options = Array.isArray(raw.options) ? raw.options.map((v) => String(v || "").trim()).filter(Boolean) : base.options;
    const correctIndex = Math.max(0, Math.min(options.length - 1, toInt(raw.correct_index, 0)));
    return {
      sentence: String(raw.sentence || base.sentence),
      options: options.length ? options : base.options,
      correct_index: Number.isFinite(correctIndex) ? correctIndex : 0,
    };
  }

  if (type === "scramble") {
    const targetWords = Array.isArray(raw.target_words)
      ? raw.target_words.map((v) => String(v || "").trim()).filter(Boolean)
      : base.target_words;
    const defaultOrder = targetWords.map((_, idx) => idx);
    const answerOrder = Array.isArray(raw.answer_order)
      ? raw.answer_order.map((v, idx) => toInt(v, idx))
      : defaultOrder;
    return {
      prompt_native: String(raw.prompt_native || base.prompt_native),
      target_words: targetWords.length ? targetWords : base.target_words,
      answer_order: answerOrder.length ? answerOrder : defaultOrder,
    };
  }

  if (type === "audio_match") {
    return {
      text_target: String(raw.text_target || base.text_target),
      mode: String(raw.mode || base.mode),
      provider: "elevenlabs",
      audio_url: String(raw.audio_url || ""),
    };
  }

  if (type === "image_match") {
    const rawOptions = Array.isArray(raw.options) ? raw.options : [];
    const options = Array.from({ length: 4 }, (_, idx) => {
      const source = rawOptions[idx] || {};
      return {
        vocab_id: String(source.vocab_id || ""),
        image_url: String(source.image_url || ""),
      };
    });
    const correctIndex = Math.max(0, Math.min(3, toInt(raw.correct_index, 0)));
    return {
      question_native: String(raw.question_native || base.question_native),
      options,
      correct_index: Number.isFinite(correctIndex) ? correctIndex : 0,
    };
  }

  if (type === "pairs") {
    const pairs = Array.isArray(raw.pairs)
      ? raw.pairs
          .map((pair) => ({
            native: String(pair?.native || "").trim(),
            target: String(pair?.target || "").trim(),
          }))
          .filter((pair) => pair.native || pair.target)
      : base.pairs;
    return {
      pairs: pairs.length ? pairs : base.pairs,
    };
  }

  return base;
}

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random()}`;
}

function createDraft(overrides = {}) {
  const type = overrides.type || "cloze";
  const rawContent = overrides.contentJson;
  const parsed = typeof rawContent === "string" ? safeParseJson(rawContent) : rawContent;
  const resolved = normalizeContent(type, parsed);

  return {
    localId: createLocalId(),
    type,
    status: overrides.status || "published",
    title: overrides.title || "",
    lessonId: overrides.lessonId || "",
    contentJson: toPrettyJson(resolved),
  };
}

function moveArrayItem(list, fromIndex, toIndex) {
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function GuidedEditor({ item, content, onPatch }) {
  if (item.type === "cloze") {
    return (
      <div className="grid gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Frase</label>
        <input
          value={content.sentence}
          onChange={(event) => onPatch({ sentence: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="I ____ a student."
        />
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Opciones (una por linea)</label>
        <textarea
          rows={4}
          value={toLineText(content.options)}
          onChange={(event) => onPatch({ options: fromLineText(event.target.value) })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        />
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Indice correcto</label>
        <input
          type="number"
          min={0}
          max={Math.max(0, content.options.length - 1)}
          value={content.correct_index}
          onChange={(event) => onPatch({ correct_index: toInt(event.target.value, 0) })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        />
      </div>
    );
  }

  if (item.type === "scramble") {
    return (
      <div className="grid gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Prompt nativo</label>
        <input
          value={content.prompt_native}
          onChange={(event) => onPatch({ prompt_native: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Yo soy estudiante"
        />
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Palabras target (una por linea)</label>
        <textarea
          rows={4}
          value={toLineText(content.target_words)}
          onChange={(event) => {
            const words = fromLineText(event.target.value);
            onPatch({
              target_words: words,
              answer_order: words.map((_, idx) => idx),
            });
          }}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        />
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Orden correcto (indices separados por coma)
        </label>
        <input
          value={content.answer_order.join(",")}
          onChange={(event) =>
            onPatch({
              answer_order: event.target.value
                .split(",")
                .map((v, idx) => toInt(v.trim(), idx)),
            })
          }
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="0,1,2,3"
        />
      </div>
    );
  }

  if (item.type === "audio_match") {
    return (
      <div className="grid gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Texto target</label>
        <input
          value={content.text_target}
          onChange={(event) => onPatch({ text_target: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="How are you?"
        />
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Modo</label>
        <select
          value={content.mode}
          onChange={(event) => onPatch({ mode: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        >
          <option value="dictation">Dictation</option>
          <option value="translation">Translation</option>
          <option value="choice">Multiple Choice</option>
        </select>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Audio URL (opcional)</label>
        <input
          value={content.audio_url || ""}
          onChange={(event) => onPatch({ audio_url: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="https://..."
        />
        <p className="text-xs text-muted">Proveedor fijado a ElevenLabs para cache de audio.</p>
      </div>
    );
  }

  if (item.type === "image_match") {
    return (
      <div className="grid gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Pregunta nativa</label>
        <input
          value={content.question_native}
          onChange={(event) => onPatch({ question_native: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Cual es el pan?"
        />
        <div className="space-y-2">
          {content.options.map((option, idx) => (
            <div key={`${item.localId}-image-option-${idx}`} className="grid gap-2 rounded-xl border border-border bg-surface p-2">
              <p className="text-xs font-semibold text-muted">Opcion {idx + 1}</p>
              <input
                value={option.vocab_id}
                onChange={(event) => {
                  const next = content.options.map((row, rowIdx) =>
                    rowIdx === idx ? { ...row, vocab_id: event.target.value } : row
                  );
                  onPatch({ options: next });
                }}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="vocab_id (uuid)"
              />
              <input
                value={option.image_url}
                onChange={(event) => {
                  const next = content.options.map((row, rowIdx) =>
                    rowIdx === idx ? { ...row, image_url: event.target.value } : row
                  );
                  onPatch({ options: next });
                }}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="https://imagen..."
              />
            </div>
          ))}
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Indice correcto (0-3)</label>
        <input
          type="number"
          min={0}
          max={3}
          value={content.correct_index}
          onChange={(event) => onPatch({ correct_index: toInt(event.target.value, 0) })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        />
      </div>
    );
  }

  if (item.type === "pairs") {
    return (
      <div className="grid gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Pares (formato: Nativo|Target, una por linea)
        </label>
        <textarea
          rows={6}
          value={content.pairs.map((pair) => `${pair.native}|${pair.target}`).join("\n")}
          onChange={(event) => {
            const pairs = event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [native = "", target = ""] = line.split("|");
                return { native: native.trim(), target: target.trim() };
              })
              .filter((pair) => pair.native || pair.target);
            onPatch({ pairs });
          }}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Manzana|Apple"
        />
      </div>
    );
  }

  return null;
}

export default function TemplateSessionExerciseBuilder({ templateId, templateSessionId, lessonOptions = [] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTemplateSessionExerciseBatch, INITIAL_STATE);
  const [items, setItems] = useState([createDraft()]);
  const [dragIndex, setDragIndex] = useState(null);

  const batchJson = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          type: item.type,
          status: item.status,
          title: item.title,
          lessonId: item.lessonId || "",
          contentJson: item.contentJson,
        }))
      ),
    [items]
  );

  const invalidCount = useMemo(() => items.filter((item) => !safeParseJson(item.contentJson)).length, [items]);

  function addItem() {
    setItems((prev) => [...prev, createDraft()]);
  }

  function duplicateItem(localId) {
    setItems((prev) => {
      const current = prev.find((item) => item.localId === localId);
      if (!current) return prev;
      return [...prev, createDraft(current)];
    });
  }

  function removeItem(localId) {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((item) => item.localId !== localId);
    });
  }

  function updateItem(localId, patch) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        return { ...item, ...patch };
      })
    );
  }

  function updateItemContent(localId, patchObject) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        const current = normalizeContent(item.type, safeParseJson(item.contentJson));
        const next = normalizeContent(item.type, { ...current, ...patchObject });
        return { ...item, contentJson: toPrettyJson(next) };
      })
    );
  }

  function moveItem(localId, direction) {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.localId === localId);
      if (index === -1) return prev;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      return moveArrayItem(prev, index, target);
    });
  }

  function handleDrop(targetIndex) {
    if (dragIndex == null || dragIndex === targetIndex) return;
    setItems((prev) => moveArrayItem(prev, dragIndex, targetIndex));
    setDragIndex(null);
  }

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        router.refresh();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="templateSessionId" value={templateSessionId} />
      <input type="hidden" name="batchJson" value={batchJson} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
        <button
          type="button"
          onClick={addItem}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
        >
          + Agregar ejercicio
        </button>
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, createDraft(), createDraft()])}
          className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
        >
          + Agregar 2 mas
        </button>
        <p className="text-xs text-muted">Editor guiado: ya no necesitas escribir JSON para lo basico.</p>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => {
          const parsedPreview = safeParseJson(item.contentJson);
          const hasInvalidJson = !parsedPreview;
          const content = normalizeContent(item.type, parsedPreview);

          return (
            <article
              key={item.localId}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Ejercicio #{index + 1}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moveItem(item.localId, "up")}
                    className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(item.localId, "down")}
                    className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Bajar
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateItem(item.localId)}
                    className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.localId)}
                    className="rounded-full border border-danger/60 px-3 py-1 text-[11px] font-semibold text-danger transition hover:bg-danger/10"
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo</label>
                  <select
                    value={item.type}
                    onChange={(event) => {
                      const nextType = event.target.value;
                      updateItem(item.localId, {
                        type: nextType,
                        contentJson: toPrettyJson(getDefaultContent(nextType)),
                      });
                    }}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  >
                    {EXERCISE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Estado</label>
                  <select
                    value={item.status}
                    onChange={(event) => updateItem(item.localId, { status: event.target.value })}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  >
                    {EXERCISE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo (opcional)</label>
                  <input
                    value={item.title}
                    onChange={(event) => updateItem(item.localId, { title: event.target.value })}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                    placeholder="Prueba de clase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Leccion</label>
                  <select
                    value={item.lessonId}
                    onChange={(event) => updateItem(item.localId, { lessonId: event.target.value })}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">Automatica para esta clase</option>
                    {lessonOptions.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-border bg-surface p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Configuracion guiada</p>
                {hasInvalidJson ? (
                  <div className="space-y-2">
                    <p className="text-xs text-danger">JSON invalido. Corrigelo abajo o restaura una plantilla.</p>
                    <button
                      type="button"
                      onClick={() => updateItem(item.localId, { contentJson: toPrettyJson(getDefaultContent(item.type)) })}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                    >
                      Restaurar plantilla de este tipo
                    </button>
                  </div>
                ) : (
                  <GuidedEditor
                    item={item}
                    content={content}
                    onPatch={(patchObject) => updateItemContent(item.localId, patchObject)}
                  />
                )}
              </div>

              <details className="mt-3 rounded-xl border border-border bg-surface px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
                  Modo avanzado (JSON)
                </summary>
                <div className="mt-2 space-y-1">
                  <textarea
                    rows={8}
                    value={item.contentJson}
                    onChange={(event) => updateItem(item.localId, { contentJson: event.target.value })}
                    className={`w-full rounded-xl border bg-surface-2 px-3 py-2 font-mono text-xs ${
                      hasInvalidJson ? "border-danger/60 text-danger" : "border-border text-foreground"
                    }`}
                  />
                  <p className="text-xs text-muted">
                    {hasInvalidJson ? "JSON invalido. Corrigelo antes de guardar." : "JSON valido."}
                  </p>
                </div>
              </details>
            </article>
          );
        })}
      </div>

      {state?.error ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state?.warning ? (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          {state.warning}
        </p>
      ) : null}
      {state?.message ? (
        <p className="rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      ) : null}

      {invalidCount ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Hay {invalidCount} ejercicio(s) con JSON invalido.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || Boolean(invalidCount)}
          className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Creando prueba..." : `Crear prueba (${items.length} ejercicio${items.length === 1 ? "" : "s"})`}
        </button>
        <p className="text-xs text-muted">Puedes crear una sola tarjeta o una serie completa de ejercicios.</p>
      </div>
    </form>
  );
}
