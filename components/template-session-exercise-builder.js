"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCourseSessionExerciseBatch, saveTemplateSessionExerciseBatch } from "@/app/admin/actions";
import {
  buildListeningQuestionsFromContent,
  createDefaultListeningQuestion,
  getListeningMaxPlays,
  isYouTubeUrl,
  LISTENING_QUESTION_TYPES,
  normalizeListeningQuestion,
  normalizeListeningQuestionType,
} from "@/lib/listening-exercise";
import {
  normalizeBlankKey as normalizeClozeBlankKey,
  splitClozeSentenceSegments,
  tokenizeClozeSentence,
  toClozeDisplayText,
} from "@/lib/cloze-blanks";

export const EXERCISE_TYPE_OPTIONS = [
  { value: "scramble", label: "Scrambled Sentence" },
  { value: "audio_match", label: "Listening Exercise" },
  { value: "reading_exercise", label: "Reading Exercise" },
  { value: "image_match", label: "Image-Word Association" },
  { value: "pairs", label: "Pairs Game" },
  { value: "cloze", label: "Fill in the blanks" },
];

export const SKILL_TAG_OPTIONS = [
  { value: "listening", label: "Listening" },
  { value: "reading", label: "Reading" },
  { value: "grammar", label: "Grammar" },
  { value: "vocabulary", label: "Vocabulary" },
];

const EXERCISE_STATUS_OPTIONS = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

const INITIAL_STATE = { success: false, message: null, warning: null, error: null, created: 0 };

function normalizeQuizTitle(value) {
  const raw = String(value || "").trim();
  return raw || "Prueba de clase";
}

export function toPrettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export function safeParseJson(value) {
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

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round2(value) {
  return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

export function normalizePointValue(value, fallback = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return round2(Math.max(0, Math.min(100, parsed)));
}

export function normalizeEstimatedTimeMinutes(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, parsed);
}

function normalizeBlankKey(value, fallbackIndex = 1) {
  return normalizeClozeBlankKey(value, fallbackIndex);
}

function normalizeOptionId(value, fallbackIndex = 1) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return `opt_${fallbackIndex}`;
  if (raw.startsWith("opt_")) return raw;
  return `opt_${raw}`;
}

function createStableEditorId(prefix = "item") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createBlankId() {
  return createStableEditorId("blank");
}

function createOptionId() {
  return createStableEditorId("opt");
}

function createPairId() {
  return createStableEditorId("pair");
}

export function getDefaultContent(type) {
  switch (type) {
    case "scramble":
      return {
        prompt_native: "Yo soy estudiante",
        target_words: ["I", "am", "a", "student"],
        answer_order: [0, 1, 2, 3],
        point_value: 10,
      };
    case "audio_match":
      return {
        listening_title: "",
        prompt_native: "Listen to the audio and answer the questions.",
        provider: "youtube",
        source_type: "youtube",
        youtube_url: "",
        audio_url: "",
        start_time: "",
        end_time: "",
        max_plays: 2,
        questions: [
          createDefaultListeningQuestion(LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE, 0),
        ],
        point_value: 10,
      };
    case "reading_exercise":
      return {
        title: "Reading Title",
        reading_title: "Reading Title",
        text: "Write the reading passage here.",
        image_url: "",
        questions: [
          createDefaultListeningQuestion(LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE, 0),
        ],
        point_value: 10,
      };
    case "image_match":
      return {
        question_native: "Que palabra corresponde a la imagen?",
        image_url: "",
        options: [
          { label: "Bread", vocab_id: "" },
          { label: "Water", vocab_id: "" },
          { label: "Milk", vocab_id: "" },
          { label: "House", vocab_id: "" },
        ],
        correct_index: 0,
        correct_vocab_id: "",
        point_value: 10,
      };
    case "pairs":
      return {
        pairs_title: "",
        pairs: [
          { id: createPairId(), native: "Manzana", target: "Apple" },
          { id: createPairId(), native: "Pan", target: "Bread" },
        ],
        point_value: 10,
      };
    case "cloze":
    default:
      return {
        sentence: "",
        options_pool: [
          { id: createOptionId(), text: "" },
        ],
        blanks: [],
        point_value: 10,
      };
  }
}

export function defaultSkillTagByType(type) {
  if (type === "audio_match") return "listening";
  if (type === "reading_exercise") return "reading";
  if (type === "image_match" || type === "pairs") return "reading";
  return "grammar";
}

export function normalizeSkillTag(value, type) {
  let raw = String(value || "").trim().toLowerCase();
  if (raw === "speaking") {
    raw = defaultSkillTagByType(type);
  }
  if (raw === "writing") raw = "grammar";
  if (SKILL_TAG_OPTIONS.some((option) => option.value === raw)) return raw;
  return defaultSkillTagByType(type);
}

function resolveEditableText(rawValue, fallbackValue = "") {
  if (rawValue == null) return String(fallbackValue ?? "");
  return String(rawValue);
}

export function normalizeContent(type, rawObject) {
  const base = getDefaultContent(type);
  const raw = rawObject && typeof rawObject === "object" ? rawObject : {};
  const pointValue = normalizePointValue(raw.point_value ?? raw.pointValue, normalizePointValue(base.point_value, 10));
  const estimatedTimeMinutes = normalizeEstimatedTimeMinutes(
    raw.estimated_time_minutes ?? raw.estimatedTimeMinutes ?? base.estimated_time_minutes
  );

  if (type === "cloze") {
    const fallbackContent = getDefaultContent("cloze");
    const rawSentence = resolveEditableText(raw.sentence, fallbackContent.sentence);

    const optionsPool = [];
    const appendPoolOption = (text = "") => {
      let optionId = createOptionId();
      while (optionsPool.some((option) => option.id === optionId)) {
        optionId = createOptionId();
      }
      optionsPool.push({ id: optionId, text: String(text || "") });
      return optionId;
    };
    const ensurePoolOption = (optionId, fallbackText = "") => {
      const requestedId = String(optionId || "").trim();
      const safeId = requestedId ? normalizeOptionId(requestedId, optionsPool.length + 1) : createOptionId();
      const existing = optionsPool.find((option) => option.id === safeId);
      if (existing) {
        if (!String(existing.text || "").trim() && String(fallbackText || "").trim()) {
          existing.text = String(fallbackText || "");
        }
        return safeId;
      }
      optionsPool.push({ id: safeId, text: String(fallbackText || "") });
      return safeId;
    };

    const rawPool = Array.isArray(raw.options_pool)
      ? raw.options_pool
      : (Array.isArray(raw.optionsPool) ? raw.optionsPool : []);
    rawPool.forEach((entry) => {
      if (typeof entry === "string") {
        appendPoolOption(entry);
        return;
      }
      const source = entry && typeof entry === "object" ? entry : {};
      ensurePoolOption(
        source.id || source.option_id || source.optionId || "",
        source.text || source.value || source.label || ""
      );
    });

    const resolveCorrectOptionId = (source = {}, fallbackOptionIds = []) => {
      let correctOptionId = String(source.correct_option_id || source.correctOptionId || "").trim();
      if (correctOptionId) {
        return ensurePoolOption(correctOptionId, "");
      }

      const answerText = String(source.answer || source.correct || "").trim();
      if (answerText) {
        const byText = optionsPool.find(
          (option) => String(option.text || "").trim().toLowerCase() === answerText.toLowerCase()
        );
        return byText?.id || appendPoolOption(answerText);
      }

      const correctIndex = toInt(source.correct_index ?? source.correctIndex, -1);
      if (correctIndex >= 0 && correctIndex < fallbackOptionIds.length) {
        return fallbackOptionIds[correctIndex];
      }

      return null;
    };

    const rawBlanks = Array.isArray(raw.blanks) ? raw.blanks : [];
    const blanks = rawBlanks.map((blank, idx) => {
      const source = blank && typeof blank === "object" ? blank : {};
      const requestedId = String(source.id || source.key || "").trim();
      return {
        id: requestedId ? normalizeBlankKey(requestedId, idx + 1) : createBlankId(),
        correct_option_id: resolveCorrectOptionId(source),
      };
    });

    if (!blanks.length) {
      const legacyOptionTexts = Array.isArray(raw.options)
        ? raw.options.map((value) => String(value || ""))
        : [];
      const hasLegacyBlank =
        legacyOptionTexts.length > 0 ||
        raw.answer != null ||
        raw.correct != null ||
        raw.correct_index != null ||
        raw.correctIndex != null;

      if (hasLegacyBlank) {
        const legacyOptionIds = legacyOptionTexts.map((text) => appendPoolOption(text));
        blanks.push({
          id: createBlankId(),
          correct_option_id: resolveCorrectOptionId(raw, legacyOptionIds),
        });
      }
    }

    if (!optionsPool.length) {
      optionsPool.push({
        id: String(fallbackContent.options_pool?.[0]?.id || "").trim() || createOptionId(),
        text: String(fallbackContent.options_pool?.[0]?.text || ""),
      });
    }

    const blankById = new Map(blanks.map((blank, index) => [normalizeBlankKey(blank.id, index + 1), blank]));
    const fallbackBlankKeys = blanks.map((blank, index) => normalizeBlankKey(blank.id, index + 1));
    const tokenized = tokenizeClozeSentence(rawSentence, fallbackBlankKeys);
    const orderedBlanks = tokenized.orderedKeys.map((key) => {
      const existing = blankById.get(key);
      if (existing) return { ...existing, id: key };
      return { id: key, correct_option_id: null };
    });

    return {
      sentence: tokenized.sentence,
      blanks: orderedBlanks,
      options_pool: optionsPool,
      point_value: pointValue,
      estimated_time_minutes: estimatedTimeMinutes,
    };
  }

  if (type === "scramble") {
    const targetWords = Array.isArray(raw.target_words)
      ? raw.target_words.map((v) => String(v ?? ""))
      : base.target_words;
    const defaultOrder = targetWords.map((_, idx) => idx);
    const answerOrder = Array.isArray(raw.answer_order)
      ? raw.answer_order.map((v, idx) => toInt(v, idx))
      : defaultOrder;
    return {
      prompt_native: resolveEditableText(raw.prompt_native, base.prompt_native),
      target_words: targetWords.length ? targetWords : base.target_words,
      answer_order: answerOrder.length ? answerOrder : defaultOrder,
      point_value: pointValue,
      estimated_time_minutes: estimatedTimeMinutes,
    };
  }

  if (type === "audio_match") {
    const legacyAudioUrl = resolveEditableText(raw.audio_url ?? raw.audioUrl, "");
    const explicitYouTubeValue = raw.youtube_url ?? raw.youtubeUrl;
    const explicitYoutubeUrl = resolveEditableText(explicitYouTubeValue, "");
    const youtubeUrl = explicitYoutubeUrl || (isYouTubeUrl(legacyAudioUrl) ? legacyAudioUrl : "");
    return {
      listening_title: resolveEditableText(raw.listening_title ?? raw.listeningTitle ?? raw.title, base.listening_title ?? ""),
      prompt_native: resolveEditableText(raw.prompt_native ?? raw.promptNative ?? raw.instructions, base.prompt_native),
      provider: youtubeUrl ? "youtube" : String(raw.provider ?? base.provider ?? "youtube"),
      source_type: youtubeUrl ? "youtube" : (legacyAudioUrl ? "audio" : "youtube"),
      youtube_url: youtubeUrl,
      audio_url: youtubeUrl ? "" : legacyAudioUrl,
      start_time: resolveEditableText(raw.start_time ?? raw.startTime, base.start_time ?? ""),
      end_time: resolveEditableText(raw.end_time ?? raw.endTime, base.end_time ?? ""),
      max_plays: getListeningMaxPlays(raw, getListeningMaxPlays(base, 1)),
      questions: buildListeningQuestionsFromContent(raw, {
        preserveDraftText: true,
        allowBlankPrompt: true,
      }),
      point_value: pointValue,
      estimated_time_minutes: estimatedTimeMinutes,
    };
  }

  if (type === "reading_exercise") {
    const readingTitle = resolveEditableText(raw.title ?? raw.reading_title ?? raw.readingTitle, base.title);
    return {
      title: readingTitle,
      reading_title: readingTitle,
      text: resolveEditableText(
        raw.text ?? raw.reading_text ?? raw.readingText ?? raw.body ?? raw.passage,
        base.text
      ),
      image_url: resolveEditableText(raw.image_url ?? raw.imageUrl, base.image_url ?? ""),
      questions: buildListeningQuestionsFromContent(raw, {
        preserveDraftText: true,
        allowBlankPrompt: true,
      }),
      point_value: pointValue,
      estimated_time_minutes: estimatedTimeMinutes,
    };
  }

  if (type === "image_match") {
    const rawOptions = Array.isArray(raw.options) ? raw.options : [];
    const mappedOptions = rawOptions.map((option) => {
      if (typeof option === "string") {
        return {
          label: String(option),
          vocab_id: "",
          image_url: "",
        };
      }
      const source = option && typeof option === "object" ? option : {};
      return {
        label: resolveEditableText(
          source.label ??
            source.word_native ??
            source.word_target ??
            source.text ??
            source.option ??
            source.vocab_id ??
            "",
          ""
        ),
        vocab_id: String(source.vocab_id || source.vocabId || "").trim(),
        image_url: String(source.image_url || source.imageUrl || "").trim(),
      };
    });
    const options = Array.from({ length: 4 }, (_, idx) => {
      const source = mappedOptions[idx] || {};
      return {
        label: resolveEditableText(source.label, ""),
        vocab_id: String(source.vocab_id || "").trim(),
      };
    });
    const correctVocabId = String(raw.correct_vocab_id || raw.correctVocabId || "").trim();
    const defaultIndex = Math.max(0, Math.min(3, toInt(raw.correct_index, 0)));
    const correctIndexByVocab = correctVocabId
      ? options.findIndex((option) => option.vocab_id && option.vocab_id === correctVocabId)
      : -1;
    const correctIndex = correctIndexByVocab >= 0 ? correctIndexByVocab : defaultIndex;
    const fallbackImageUrl = mappedOptions[correctIndex]?.image_url || mappedOptions[0]?.image_url || "";
    const imageUrl = String(raw.image_url || raw.imageUrl || fallbackImageUrl || "").trim();
    return {
      question_native: resolveEditableText(raw.question_native, base.question_native),
      image_url: imageUrl,
      options,
      correct_index: Number.isFinite(correctIndex) ? correctIndex : 0,
      correct_vocab_id: options[correctIndex]?.vocab_id || "",
      point_value: pointValue,
      estimated_time_minutes: estimatedTimeMinutes,
    };
  }

  if (type === "pairs") {
    const pairs = Array.isArray(raw.pairs)
      ? raw.pairs
          .map((pair) => ({
            id: String(pair?.id || "").trim() || createPairId(),
            native: resolveEditableText(pair?.native, ""),
            target: resolveEditableText(pair?.target, ""),
          }))
      : (Array.isArray(base.pairs)
        ? base.pairs.map((pair) => ({
          id: String(pair?.id || "").trim() || createPairId(),
          native: resolveEditableText(pair?.native, ""),
          target: resolveEditableText(pair?.target, ""),
        }))
        : []);
    return {
      pairs_title: resolveEditableText(raw.pairs_title ?? raw.pairsTitle ?? raw.title, base.pairs_title ?? ""),
      pairs,
      point_value: pointValue,
      estimated_time_minutes: estimatedTimeMinutes,
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

export function createDraft(overrides = {}) {
  const type = overrides.type || "cloze";
  const rawContent = overrides.contentJson;
  const parsed = typeof rawContent === "string" ? safeParseJson(rawContent) : rawContent;
  const resolved = normalizeContent(type, parsed);

  return {
    localId: createLocalId(),
    itemId: overrides.itemId || "",
    exerciseId: overrides.exerciseId || "",
    type,
    status: overrides.status || "published",
    title: overrides.title || "",
    lessonId: overrides.lessonId || "",
    skillTag: normalizeSkillTag(overrides.skillTag, type),
    contentJson: toPrettyJson(resolved),
  };
}

export function moveArrayItem(list, fromIndex, toIndex) {
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function GuidedEditor({ item, content, onPatch }) {
  const [newScrambleWord, setNewScrambleWord] = useState("");
  const [scrambleDragIndex, setScrambleDragIndex] = useState(null);
  const clozeSentenceRef = useRef(null);

  if (item.type === "cloze") {
    const blanks = Array.isArray(content.blanks) ? content.blanks : [];
    const optionsPool = Array.isArray(content.options_pool) ? content.options_pool : [];
    const sentenceEditorValue = toClozeDisplayText(String(content.sentence || ""));
    const poolMap = new Map(
      optionsPool.map((option) => [String(option?.id || "").trim(), { ...option }])
    );
    const usedOptionIds = new Set(
      blanks
        .map((blank) => String(blank?.correct_option_id || "").trim())
        .filter(Boolean)
    );

    const updateBlank = (blankId, patchObject) => {
      const safeBlankId = String(blankId || "").trim();
      if (!safeBlankId) return;
      const next = blanks.map((blank) => (
        String(blank?.id || "").trim() === safeBlankId
          ? { ...blank, ...patchObject }
          : blank
      ));
      onPatch({ blanks: next });
    };

    const updateOptionText = (optionId, textValue) => {
      const safeOptionId = String(optionId || "").trim();
      if (!safeOptionId) return;
      const nextPool = optionsPool.map((option) =>
        String(option?.id || "").trim() === safeOptionId
          ? { ...option, text: textValue }
          : option
      );
      onPatch({ options_pool: nextPool });
    };

    const patchSentenceFromEditor = (editorSentence, sourceBlanks = blanks) => {
      const currentBlanks = Array.isArray(sourceBlanks) ? sourceBlanks : [];
      const fallbackKeys = currentBlanks.map((blank, index) =>
        normalizeBlankKey(blank?.id || blank?.key || `blank_${index + 1}`, index + 1)
      );
      const tokenized = tokenizeClozeSentence(editorSentence, fallbackKeys);
      const blankById = new Map(
        currentBlanks.map((blank, index) => [
          normalizeBlankKey(blank?.id || blank?.key || `blank_${index + 1}`, index + 1),
          blank,
        ])
      );
      const nextBlanks = tokenized.orderedKeys.map((key) => {
        const existing = blankById.get(key);
        if (existing) return { ...existing, id: key };
        return { id: key, correct_option_id: null };
      });

      onPatch({
        sentence: tokenized.sentence,
        blanks: nextBlanks,
      });
    };

    const addBlankToken = () => {
      const blankId = createBlankId();
      const token = "[Blank]";
      const sentence = sentenceEditorValue;
      const nextBlanks = [...blanks, {
        id: blankId,
        correct_option_id: null,
      }];
      const node = clozeSentenceRef.current;
      let nextSentence = sentence;
      if (node && typeof node.selectionStart === "number" && typeof node.selectionEnd === "number") {
        const start = node.selectionStart;
        const end = node.selectionEnd;
        nextSentence = `${sentence.slice(0, start)}${token}${sentence.slice(end)}`;
      } else {
        nextSentence = `${sentence}${sentence ? " " : ""}${token}`;
      }
      patchSentenceFromEditor(nextSentence, nextBlanks);
    };

    const addOption = () => {
      onPatch({
        options_pool: [...optionsPool, { id: createOptionId(), text: "" }],
      });
    };

    const removeOption = (optionId) => {
      const safeOptionId = String(optionId || "").trim();
      if (!safeOptionId || usedOptionIds.has(safeOptionId) || optionsPool.length <= 1) return;
      const nextPool = optionsPool.filter((option) => String(option?.id || "").trim() !== safeOptionId);
      onPatch({
        options_pool: nextPool.length ? nextPool : [{ id: createOptionId(), text: "" }],
      });
    };

    const removeBlank = (blankId) => {
      const safeBlankId = String(blankId || "").trim();
      if (!safeBlankId) return;
      const targetBlankId = normalizeBlankKey(safeBlankId, 1);
      const nextBlanks = blanks.filter(
        (blank) => normalizeBlankKey(blank?.id || blank?.key || "", 1) !== targetBlankId
      );
      const split = splitClozeSentenceSegments(
        String(content.sentence || ""),
        blanks.map((blank, index) => normalizeBlankKey(blank?.id || blank?.key || `blank_${index + 1}`, index + 1))
      );
      const nextSentenceDisplay = split.segments
        .filter((segment) => !(segment.kind === "blank" && normalizeBlankKey(segment.key || "", 1) === targetBlankId))
        .map((segment) => (segment.kind === "blank" ? "[Blank]" : String(segment.value || "")))
        .join("");

      patchSentenceFromEditor(nextSentenceDisplay, nextBlanks);
    };

    return (
      <div className="grid gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Frase</label>
        <textarea
          ref={clozeSentenceRef}
          rows={3}
          value={sentenceEditorValue}
          onChange={(event) => patchSentenceFromEditor(event.target.value, blanks)}
          onKeyDownCapture={(event) => {
            event.stopPropagation();
          }}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Ej: I [Blank] to school and [Blank] English."
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addBlankToken}
            className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            + Agregar blank
          </button>
          <p className="text-xs text-muted">
            Inserta [Blank] en la posicion del cursor. Despues asigna la respuesta correcta desde el pool global.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Pool global de opciones ({optionsPool.length})
              </p>
              <p className="mt-1 text-xs text-muted">
                El alumno ve todas las opciones juntas. Cada blank define 1 opcion correcta.
              </p>
            </div>
            <button
              type="button"
              onClick={addOption}
              className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              + Agregar opcion
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {optionsPool.map((option, optionIndex) => {
              const optionId = String(option?.id || "").trim();
              const isUsed = usedOptionIds.has(optionId);
              const cannotRemove = isUsed || optionsPool.length <= 1;
              return (
                <div
                  key={`cloze-option-${optionId}`}
                  className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Opcion {optionIndex + 1}
                    </p>
                    <input
                      value={String(option?.text || "")}
                      onChange={(event) => updateOptionText(optionId, event.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground"
                      placeholder="Texto de opcion"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={cannotRemove}
                    onClick={() => removeOption(optionId)}
                    className="rounded-lg border border-danger/60 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Eliminar
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          {blanks.map((blank, blankIndex) => {
            const blankId = normalizeBlankKey(blank.id || blank.key || `blank_${blankIndex + 1}`, blankIndex + 1);
            const currentCorrectId = String(blank.correct_option_id || "").trim();
            const missingCorrect = currentCorrectId && !poolMap.has(currentCorrectId);

            return (
              <div key={`cloze-blank-${blankId}`} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Blank {blankIndex + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeBlank(blankId)}
                    className="rounded-lg border border-danger/60 px-2 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                  >
                    Eliminar blank
                  </button>
                </div>

                <div className="mt-3 grid gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Respuesta correcta
                  </label>
                  <select
                    value={currentCorrectId}
                    onChange={(event) =>
                      updateBlank(blankId, { correct_option_id: event.target.value || null })
                    }
                    className="w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-foreground"
                  >
                    <option value="">Selecciona una opcion</option>
                    {optionsPool.map((option) => {
                      const optionId = String(option?.id || "").trim();
                      return (
                        <option key={`cloze-blank-correct-${blankId}-${optionId}`} value={optionId}>
                          {String(option?.text || "").trim() || "(sin texto)"}
                        </option>
                      );
                    })}
                  </select>
                  {missingCorrect ? (
                    <p className="text-xs text-danger">
                      La opcion correcta actual ya no existe en el pool global.
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {!blanks.length ? (
          <p className="text-xs text-muted">
            Este ejercicio puede empezar sin blanks. Usa "Agregar blank" para construirlo desde cero.
          </p>
        ) : null}
      </div>
    );
  }

  if (item.type === "scramble") {
    const words = Array.isArray(content.target_words) ? content.target_words : [];

    const updateWords = (nextWords) => {
      const cleanWords = (Array.isArray(nextWords) ? nextWords : [])
        .map((word) => String(word || "").trim())
        .filter(Boolean);
      onPatch({
        target_words: cleanWords,
        answer_order: cleanWords.map((_, idx) => idx),
      });
    };

    const addWord = () => {
      const nextWord = String(newScrambleWord || "").trim();
      if (!nextWord) return;
      updateWords([...words, nextWord]);
      setNewScrambleWord("");
    };

    const reorderWord = (targetIndex) => {
      if (scrambleDragIndex == null || scrambleDragIndex === targetIndex) return;
      const nextWords = moveArrayItem(words, scrambleDragIndex, targetIndex);
      setScrambleDragIndex(null);
      updateWords(nextWords);
    };

    return (
      <div className="grid gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Prompt nativo</label>
        <input
          value={content.prompt_native}
          onChange={(event) => onPatch({ prompt_native: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Yo soy estudiante"
        />

        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Palabras target</p>
          <div className="mt-2 flex min-h-10 flex-wrap gap-2">
            {words.length ? (
              words.map((word, idx) => (
                <div
                  key={`${item.localId}-scramble-word-${idx}`}
                  draggable
                  onDragStart={(event) => {
                    setScrambleDragIndex(idx);
                    if (event.dataTransfer) {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(idx));
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer) {
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    reorderWord(idx);
                  }}
                  onDragEnd={() => setScrambleDragIndex(null)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold transition ${
                    scrambleDragIndex === idx
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-border bg-surface-2 text-foreground hover:border-primary hover:bg-primary/10"
                  }`}
                >
                  <span className="text-[11px] uppercase tracking-wide text-muted">drag</span>
                  <span>{word}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateWords(words.filter((_, wordIdx) => wordIdx !== idx));
                    }}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted transition hover:border-danger/70 hover:text-danger"
                    title="Quitar palabra"
                  >
                    x
                  </button>
                </div>
              ))
            ) : (
              <span className="text-sm text-muted">Aun no agregaste palabras.</span>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={newScrambleWord}
              onChange={(event) => setNewScrambleWord(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addWord();
              }}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              placeholder="Escribe una palabra y presiona Enter"
            />
            <button
              type="button"
              onClick={addWord}
              className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Agregar
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Arrastra los chips para definir el orden correcto del answer. En alumno se mezclan automaticamente.
          </p>
        </div>
      </div>
    );
  }

  if (item.type === "audio_match" || item.type === "reading_exercise") {
    const isAudioExercise = item.type === "audio_match";
    const questions = Array.isArray(content.questions) ? content.questions : [];

    const updateQuestion = (questionIndex, patchObject) => {
      const next = questions.map((question, idx) => (
        idx === questionIndex
          ? normalizeListeningQuestion({ ...question, ...patchObject }, idx, { preserveDraftText: true, allowBlankPrompt: true })
          : normalizeListeningQuestion(question, idx, { preserveDraftText: true, allowBlankPrompt: true })
      ));
      onPatch({ questions: next });
    };

    const addQuestion = (questionType) => {
      const next = [
        ...questions.map((question, idx) => normalizeListeningQuestion(question, idx, { preserveDraftText: true, allowBlankPrompt: true })),
        createDefaultListeningQuestion(normalizeListeningQuestionType(questionType), questions.length),
      ];
      onPatch({ questions: next });
    };

    const removeQuestion = (questionIndex) => {
      if (questions.length <= 1) return;
      const next = questions
        .filter((_, idx) => idx !== questionIndex)
        .map((question, idx) => normalizeListeningQuestion(question, idx, { preserveDraftText: true, allowBlankPrompt: true }));
      onPatch({ questions: next });
    };

    return (
      <div className="grid gap-3">
        {isAudioExercise ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo</label>
                <input
                  value={content.listening_title || ""}
                  onChange={(event) => onPatch({ listening_title: event.target.value })}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="Listening Title"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Instrucciones</label>
                <input
                  value={content.prompt_native || ""}
                  onChange={(event) => onPatch({ prompt_native: event.target.value })}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="Listen to the audio and answer the questions."
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Link de YouTube</label>
                <input
                  value={content.youtube_url || ""}
                  onChange={(event) => onPatch({ youtube_url: event.target.value, provider: "youtube", source_type: "youtube" })}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <p className="text-xs text-muted">Por ahora el audio se reproduce desde YouTube (solo audio en alumno).</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Max plays</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={Math.max(1, toInt(content.max_plays, 1))}
                  onChange={(event) => onPatch({ max_plays: Math.max(1, toInt(event.target.value, 1)) })}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Start time (opcional)</label>
                <input
                  value={content.start_time ?? ""}
                  onChange={(event) => onPatch({ start_time: event.target.value })}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="0:30 o 30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">End time (opcional)</label>
                <input
                  value={content.end_time ?? ""}
                  onChange={(event) => onPatch({ end_time: event.target.value })}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="1:15 o 75"
                />
              </div>
            </div>
            <p className="text-xs text-muted">
              Puedes usar segundos, mm:ss o hh:mm:ss. Si defines solo start time, el audio sigue hasta el final del video.
            </p>
          </>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo</label>
                <input
                  value={content.title || ""}
                  onChange={(event) => onPatch({ title: event.target.value })}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="Reading Title"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Imagen (opcional)</label>
                <input
                  value={content.image_url || ""}
                  onChange={(event) => onPatch({ image_url: event.target.value })}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Texto del reading</label>
              <textarea
                rows={8}
                value={content.text || ""}
                onChange={(event) => onPatch({ text: event.target.value })}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="Write the reading passage here."
              />
            </div>
          </>
        )}

        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Preguntas ({questions.length})
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addQuestion(LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE)}
                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
              >
                + Multiple Choice
              </button>
              <button
                type="button"
                onClick={() => addQuestion(LISTENING_QUESTION_TYPES.WRITTEN)}
                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
              >
                + Escrita
              </button>
              <button
                type="button"
                onClick={() => addQuestion(LISTENING_QUESTION_TYPES.TRUE_FALSE)}
                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
              >
                + True / False
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {questions.map((question, questionIndex) => {
              const normalizedQuestion = normalizeListeningQuestion(question, questionIndex, {
                preserveDraftText: true,
                allowBlankPrompt: true,
              });
              const questionType = normalizedQuestion.type;
              return (
                <div
                  key={`${item.localId}-question-${normalizedQuestion.id}-${questionIndex}`}
                  className="rounded-xl border border-border bg-surface-2 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Pregunta {questionIndex + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeQuestion(questionIndex)}
                      disabled={questions.length <= 1}
                      className="rounded-lg border border-danger/60 px-2 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Quitar
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">Tipo</label>
                        <select
                          value={questionType}
                          onChange={(event) => {
                            const nextType = normalizeListeningQuestionType(event.target.value);
                            updateQuestion(
                              questionIndex,
                              createDefaultListeningQuestion(nextType, questionIndex)
                            );
                          }}
                          className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground"
                        >
                          <option value={LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE}>Multiple Choice</option>
                          <option value={LISTENING_QUESTION_TYPES.WRITTEN}>Respuesta escrita</option>
                          <option value={LISTENING_QUESTION_TYPES.TRUE_FALSE}>True / False</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">Prompt</label>
                        <input
                          value={normalizedQuestion.prompt || ""}
                          onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })}
                          className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground"
                          placeholder={isAudioExercise ? "What did the speaker say?" : "What does the text say?"}
                        />
                      </div>
                    </div>

                    {questionType === LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {normalizedQuestion.options.map((option, optionIndex) => (
                            <div
                              key={`${normalizedQuestion.id}-option-${optionIndex}`}
                              className="grid gap-1 rounded-lg border border-border bg-surface p-2"
                            >
                              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                                Opcion {optionIndex + 1}
                              </label>
                              <input
                                value={option || ""}
                                onChange={(event) => {
                                  const nextOptions = normalizedQuestion.options.map((currentOption, idx) => (
                                    idx === optionIndex ? event.target.value : currentOption
                                  ));
                                  updateQuestion(questionIndex, { options: nextOptions });
                                }}
                                className="w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-foreground"
                                placeholder={`Option ${optionIndex + 1}`}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">Respuesta correcta</label>
                          <select
                            value={normalizedQuestion.correct_index}
                            onChange={(event) => updateQuestion(questionIndex, { correct_index: toInt(event.target.value, 0) })}
                            className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground"
                          >
                            {normalizedQuestion.options.map((option, optionIndex) => (
                              <option key={`${normalizedQuestion.id}-correct-${optionIndex}`} value={optionIndex}>
                                Opcion {optionIndex + 1}: {option || "(sin texto)"}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : null}

                    {questionType === LISTENING_QUESTION_TYPES.WRITTEN ? (
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Respuestas validas (una por linea)
                        </label>
                        <textarea
                          rows={3}
                          value={(normalizedQuestion.accepted_answers || []).join("\n")}
                          onChange={(event) =>
                            updateQuestion(questionIndex, {
                              accepted_answers: event.target.value
                                .split(/\r?\n/)
                                .map((value) => String(value ?? "")),
                            })
                          }
                          className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground"
                          placeholder={"example answer\nalternate answer"}
                        />
                      </div>
                    ) : null}

                    {questionType === LISTENING_QUESTION_TYPES.TRUE_FALSE ? (
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">Respuesta correcta</label>
                        <select
                          value={normalizedQuestion.correct_boolean ? "true" : "false"}
                          onChange={(event) => updateQuestion(questionIndex, { correct_boolean: event.target.value === "true" })}
                          className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground"
                        >
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (item.type === "image_match") {
    const options = Array.isArray(content.options) ? content.options : [];
    return (
      <div className="grid gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Pregunta nativa</label>
        <input
          value={content.question_native}
          onChange={(event) => onPatch({ question_native: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Que palabra corresponde a la imagen?"
        />

        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Imagen principal</label>
        <input
          value={content.image_url || ""}
          onChange={(event) => onPatch({ image_url: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="https://imagen..."
        />
        {content.image_url ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content.image_url} alt="preview imagen principal" className="h-40 w-full object-cover" />
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Opciones de respuesta</p>
          {options.map((option, idx) => (
            <div
              key={`${item.localId}-image-option-${idx}`}
              className="grid gap-2 rounded-xl border border-border bg-surface p-2 sm:grid-cols-2"
            >
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted">Opcion {idx + 1}</p>
                <input
                  value={option.label || ""}
                  onChange={(event) => {
                    const next = options.map((row, rowIdx) =>
                      rowIdx === idx ? { ...row, label: event.target.value } : row
                    );
                    onPatch({ options: next });
                  }}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="Texto de opcion"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted">Vocab ID (opcional)</p>
                <input
                  value={option.vocab_id || ""}
                  onChange={(event) => {
                    const next = options.map((row, rowIdx) =>
                      rowIdx === idx ? { ...row, vocab_id: event.target.value } : row
                    );
                    onPatch({ options: next });
                  }}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  placeholder="uuid vocab"
                />
              </div>
            </div>
          ))}
        </div>

        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Respuesta correcta</label>
        <select
          value={content.correct_index}
          onChange={(event) => {
            const nextIndex = toInt(event.target.value, 0);
            onPatch({
              correct_index: nextIndex,
              correct_vocab_id: String(options[nextIndex]?.vocab_id || ""),
            });
          }}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        >
          {options.map((option, idx) => (
            <option key={`${item.localId}-image-correct-${idx}`} value={idx}>
              Opcion {idx + 1}: {option.label || "(sin texto)"}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (item.type === "pairs") {
    const pairs = Array.isArray(content.pairs) ? content.pairs : [];
    return (
      <div className="grid gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo</label>
          <input
            value={content.pairs_title || ""}
            onChange={(event) => onPatch({ pairs_title: event.target.value })}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            placeholder="Pairs title"
          />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pares de palabras</p>
        <div className="space-y-2">
          {pairs.map((pair, idx) => (
            <div
              key={`pair-row-${String(pair?.id || idx)}`}
              className="grid gap-2 rounded-xl border border-border bg-surface p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <input
                value={pair.native || ""}
                onChange={(event) => {
                  const next = pairs.map((row, rowIdx) =>
                    rowIdx === idx ? { ...row, native: event.target.value } : row
                  );
                  onPatch({ pairs: next });
                }}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="Idioma A"
              />
              <input
                value={pair.target || ""}
                onChange={(event) => {
                  const next = pairs.map((row, rowIdx) =>
                    rowIdx === idx ? { ...row, target: event.target.value } : row
                  );
                  onPatch({ pairs: next });
                }}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="Idioma B"
              />
              <button
                type="button"
                onClick={() => onPatch({ pairs: pairs.filter((_, rowIdx) => rowIdx !== idx) })}
                className="rounded-xl border border-danger/60 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        {!pairs.length ? (
          <p className="text-xs text-muted">Aun no agregaste pares.</p>
        ) : null}
        <button
          type="button"
          onClick={() => onPatch({ pairs: [...pairs, { id: createPairId(), native: "", target: "" }] })}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 sm:w-auto"
        >
          + Agregar par
        </button>
      </div>
    );
  }

  return null;
}

export default function TemplateSessionExerciseBuilder({
  templateId = "",
  templateSessionId = "",
  commissionId = "",
  courseSessionId = "",
  initialItems = [],
  initialQuizTitle = "",
  initialEstimatedTimeMinutes = null,
  scope = "template",
}) {
  const router = useRouter();
  const submitAction = scope === "commission" ? saveCourseSessionExerciseBatch : saveTemplateSessionExerciseBatch;
  const [state, formAction, pending] = useActionState(submitAction, INITIAL_STATE);
  const [items, setItems] = useState(() =>
    Array.isArray(initialItems) && initialItems.length
      ? initialItems.map((item) => createDraft(item))
      : [createDraft()]
  );
  const [quizTitle, setQuizTitle] = useState(() => normalizeQuizTitle(initialQuizTitle));
  const [quizEstimatedTimeMinutes, setQuizEstimatedTimeMinutes] = useState(() =>
    normalizeEstimatedTimeMinutes(initialEstimatedTimeMinutes)
  );
  const [pointWarning, setPointWarning] = useState(null);

  const batchJson = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          itemId: item.itemId || "",
          exerciseId: item.exerciseId || "",
          type: item.type,
          status: item.status,
          lessonId: item.lessonId || "",
          skillTag: item.skillTag || "",
          contentJson: item.contentJson,
        }))
      ),
    [items]
  );

  const invalidCount = useMemo(() => items.filter((item) => !safeParseJson(item.contentJson)).length, [items]);
  const totalPointValue = useMemo(
    () =>
      round2(
        items.reduce((sum, item) => {
          const parsed = safeParseJson(item.contentJson);
          const content = normalizeContent(item.type, parsed);
          return sum + normalizePointValue(content.point_value, 10);
        }, 0)
      ),
    [items]
  );
  const isOverPointBudget = totalPointValue > 100.0001;

  function addItem() {
    setItems((prev) => [...prev, createDraft()]);
  }

  function duplicateItem(localId) {
    setItems((prev) => {
      const current = prev.find((item) => item.localId === localId);
      if (!current) return prev;
      return [...prev, createDraft({ ...current, itemId: "", exerciseId: "" })];
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
        const nextType = patch.type || item.type;
        const nextSkillTag = Object.prototype.hasOwnProperty.call(patch, "skillTag")
          ? patch.skillTag
          : item.skillTag;
        return {
          ...item,
          ...patch,
          type: nextType,
          skillTag: normalizeSkillTag(nextSkillTag, nextType),
        };
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

  function updateItemPointValue(localId, requestedValue, maxAllowedValue) {
    const requested = normalizePointValue(requestedValue, 0);
    const maxAllowed = normalizePointValue(maxAllowedValue, 0);
    const clamped = round2(Math.max(0, Math.min(maxAllowed, requested)));
    if (requested > maxAllowed + 0.0001) {
      setPointWarning(`El total no puede superar 100 (restante: ${maxAllowed}).`);
    } else {
      setPointWarning(null);
    }
    updateItemContent(localId, { point_value: clamped });
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
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="courseSessionId" value={courseSessionId} />
      <input type="hidden" name="batchJson" value={batchJson} />

      <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_220px]">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo de la prueba</label>
            <input
              name="quizTitle"
              value={quizTitle}
              onChange={(event) => setQuizTitle(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              placeholder="Prueba de clase"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Tiempo estimado global (min)
            </label>
            <input
              name="quizEstimatedTimeMinutes"
              type="number"
              min={1}
              step={1}
              value={quizEstimatedTimeMinutes ?? ""}
              onChange={(event) => setQuizEstimatedTimeMinutes(normalizeEstimatedTimeMinutes(event.target.value))}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <p className="text-xs text-muted">Los datos de arriba se aplican a toda la prueba, no a un ejercicio individual.</p>
          <span
            className={`ml-auto rounded-full border px-3 py-1 text-xs font-semibold ${
              totalPointValue <= 100.0001
                ? "border-success/40 bg-success/12 text-success"
                : "border-danger/45 bg-danger/12 text-danger"
            }`}
          >
            Total asignado: {totalPointValue}/100
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => {
          const parsedPreview = safeParseJson(item.contentJson);
          const hasInvalidJson = !parsedPreview;
          const content = normalizeContent(item.type, parsedPreview);
          const currentPointValue = normalizePointValue(content.point_value, 10);
          const otherPoints = round2(Math.max(0, totalPointValue - currentPointValue));
          const maxPointValue = round2(Math.max(0, 100 - otherPoints));
          const sliderMax = Math.max(0, Math.floor(maxPointValue));
          const sliderValue = Math.max(0, Math.min(sliderMax, Math.round(currentPointValue)));

          return (
            <article
              key={item.localId}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Ejercicio #{index + 1}</p>
                  {item.exerciseId ? (
                    <span className="rounded-full border border-success/35 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Guardado
                    </span>
                  ) : (
                    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                      Nuevo
                    </span>
                  )}
                </div>
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

              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo</label>
                  <select
                    value={item.type}
                    onChange={(event) => {
                      const nextType = event.target.value;
                      updateItem(item.localId, {
                        type: nextType,
                        skillTag: defaultSkillTagByType(nextType),
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
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Habilidad</label>
                  <select
                    value={item.skillTag}
                    onChange={(event) => updateItem(item.localId, { skillTag: event.target.value })}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  >
                    {SKILL_TAG_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Puntos (sobre 100)</label>
                  <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                    <input
                      type="range"
                      min={0}
                      max={sliderMax}
                      step={1}
                      value={sliderValue}
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onTouchStart={(event) => event.stopPropagation()}
                      onChange={(event) => updateItemPointValue(item.localId, event.target.value, maxPointValue)}
                      className="w-full accent-primary"
                    />
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <p className="text-xs font-semibold text-foreground">
                        {currentPointValue} puntos (max: {maxPointValue})
                      </p>
                      <input
                        type="number"
                        min={0}
                        max={maxPointValue}
                        step={1}
                        value={Math.max(0, Math.round(currentPointValue))}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                        onChange={(event) => updateItemPointValue(item.localId, event.target.value, maxPointValue)}
                        className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground"
                        aria-label="Puntaje del ejercicio"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                Este ejercicio se guarda dentro de la prueba &quot;{normalizeQuizTitle(quizTitle)}&quot;.
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
      {pointWarning ? (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          {pointWarning}
        </p>
      ) : null}

      {invalidCount ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Hay {invalidCount} ejercicio(s) con JSON invalido.
        </p>
      ) : null}
      {isOverPointBudget ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          El total no puede superar 100. Ajusta los puntos asignados.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || Boolean(invalidCount) || isOverPointBudget}
          className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending
            ? "Guardando prueba..."
            : `Guardar prueba (${items.length} ejercicio${items.length === 1 ? "" : "s"})`}
        </button>
        <p className="text-xs text-muted">Puedes crear, editar o quitar ejercicios desde el mismo editor.</p>
      </div>
    </form>
  );
}
