"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTemplateSessionExerciseBatch } from "@/app/admin/actions";

const EXERCISE_TYPE_OPTIONS = [
  { value: "scramble", label: "Scrambled Sentence" },
  { value: "audio_match", label: "Audio Match / Dictation" },
  { value: "image_match", label: "Image-Word Association" },
  { value: "pairs", label: "Pairs Game" },
  { value: "cloze", label: "Fill in the blanks" },
];

const SKILL_TAG_OPTIONS = [
  { value: "speaking", label: "Speaking" },
  { value: "reading", label: "Reading" },
  { value: "grammar", label: "Grammar" },
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

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function normalizePointValue(value, fallback = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return round2(Math.max(0, Math.min(100, parsed)));
}

function normalizeBlankKey(value, fallbackIndex = 1) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return `blank_${fallbackIndex}`;
  if (raw.startsWith("blank_")) return raw;
  return `blank_${raw}`;
}

function normalizeOptionId(value, fallbackIndex = 1) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return `opt_${fallbackIndex}`;
  if (raw.startsWith("opt_")) return raw;
  return `opt_${raw}`;
}

function extractBlankKeysFromSentence(sentence = "") {
  const text = String(sentence || "");
  const regex = /\[\[\s*(blank_[a-z0-9_-]+)\s*\]\]/gi;
  const seen = new Set();
  const keys = [];
  let match = regex.exec(text);
  while (match) {
    const key = normalizeBlankKey(match[1], keys.length + 1);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    match = regex.exec(text);
  }
  return keys;
}

function getNextOptionId(optionsPool = []) {
  let maxValue = 0;
  optionsPool.forEach((option) => {
    const optionId = String(option?.id || "").trim().toLowerCase();
    const match = optionId.match(/^opt_(\d+)$/);
    if (!match) return;
    const asNumber = toInt(match[1], 0);
    if (asNumber > maxValue) maxValue = asNumber;
  });
  return `opt_${maxValue + 1}`;
}

function getDefaultContent(type) {
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
        text_target: "How are you?",
        mode: "dictation",
        provider: "elevenlabs",
        audio_url: "",
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
        pairs: [
          { native: "Manzana", target: "Apple" },
          { native: "Pan", target: "Bread" },
        ],
        point_value: 10,
      };
    case "cloze":
    default:
      return {
        sentence: "I [[blank_1]] a student.",
        options_pool: [
          { id: "opt_1", text: "am" },
          { id: "opt_2", text: "are" },
          { id: "opt_3", text: "is" },
          { id: "opt_4", text: "be" },
        ],
        blanks: [
          {
            id: "blank_1",
            correct_option_id: "opt_1",
            new_option_ids: ["opt_1", "opt_2", "opt_3", "opt_4"],
          },
        ],
        point_value: 10,
      };
  }
}

function defaultSkillTagByType(type) {
  if (type === "audio_match") return "speaking";
  if (type === "image_match" || type === "pairs") return "reading";
  return "grammar";
}

function normalizeContent(type, rawObject) {
  const base = getDefaultContent(type);
  const raw = rawObject && typeof rawObject === "object" ? rawObject : {};
  const pointValue = normalizePointValue(raw.point_value ?? raw.pointValue, normalizePointValue(base.point_value, 10));

  if (type === "cloze") {
    const fallbackContent = getDefaultContent("cloze");
    let sentence = String(raw.sentence ?? fallbackContent.sentence ?? "");

    const optionsPool = [];
    const appendPoolOption = (text = "") => {
      const optionId = getNextOptionId(optionsPool);
      optionsPool.push({ id: optionId, text: String(text || "") });
      return optionId;
    };
    const ensurePoolOption = (optionId, fallbackText = "") => {
      const safeId = normalizeOptionId(optionId, optionsPool.length + 1);
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
    const normalizeIdList = (values, minCount = 0) => {
      const normalized = Array.from(
        new Set(
          (Array.isArray(values) ? values : [])
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .map((value) => ensurePoolOption(value, ""))
        )
      );
      while (normalized.length < minCount) {
        normalized.push(appendPoolOption(""));
      }
      return normalized;
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

    const incomingBlanks = Array.isArray(raw.blanks) ? raw.blanks : [];
    const hasPoolShape =
      rawPool.length > 0 ||
      incomingBlanks.some((blank) => {
        const source = blank && typeof blank === "object" ? blank : {};
        return (
          source.correct_option_id != null ||
          source.correctOptionId != null ||
          source.new_option_ids != null ||
          source.newOptionIds != null
        );
      });

    let blanks = [];

    if (hasPoolShape) {
      blanks = incomingBlanks.map((blank, idx) => {
        const source = blank && typeof blank === "object" ? blank : {};
        const blankId = normalizeBlankKey(source.id || source.key || `blank_${idx + 1}`, idx + 1);
        const desiredCount = idx === 0 ? 4 : 2;
        let newOptionIds = normalizeIdList(source.new_option_ids || source.newOptionIds, desiredCount);
        if (!newOptionIds.length && optionsPool.length) {
          newOptionIds = normalizeIdList(optionsPool.slice(0, desiredCount).map((option) => option.id), desiredCount);
        }

        let correctOptionId = String(source.correct_option_id || source.correctOptionId || "").trim();
        if (correctOptionId) {
          correctOptionId = ensurePoolOption(correctOptionId, "");
        }
        if (!correctOptionId) {
          const answerText = String(source.answer || source.correct || "").trim();
          if (answerText) {
            const byText = optionsPool.find(
              (option) => String(option.text || "").trim().toLowerCase() === answerText.toLowerCase()
            );
            correctOptionId = byText?.id || appendPoolOption(answerText);
            if (!newOptionIds.includes(correctOptionId)) {
              newOptionIds.push(correctOptionId);
            }
          }
        }
        if (!correctOptionId && newOptionIds.length) {
          const fromIndex = Math.max(0, Math.min(newOptionIds.length - 1, toInt(source.correct_index ?? source.correctIndex, 0)));
          correctOptionId = newOptionIds[fromIndex];
        }
        if (!correctOptionId) {
          correctOptionId = newOptionIds[0] || appendPoolOption("");
        }
        if (idx > 0 && !newOptionIds.includes(correctOptionId)) {
          correctOptionId = newOptionIds[0] || appendPoolOption("");
        }

        return {
          id: blankId,
          correct_option_id: correctOptionId,
          new_option_ids: Array.from(new Set(newOptionIds)),
        };
      });
    }

    if (!blanks.length) {
      const legacyBlanks = incomingBlanks.length
        ? incomingBlanks
        : [{
          key: "blank_1",
          options: Array.isArray(raw.options) ? raw.options : fallbackContent.options_pool.map((option) => option.text),
          correct_index: toInt(raw.correct_index ?? raw.correctIndex, 0),
          answer: raw.answer || raw.correct || "",
        }];

      blanks = legacyBlanks.map((blank, idx) => {
        const source = blank && typeof blank === "object" ? blank : {};
        const blankId = normalizeBlankKey(source.key || source.id || `blank_${idx + 1}`, idx + 1);
        const desiredCount = idx === 0 ? 4 : 2;
        const optionTexts = Array.isArray(source.options)
          ? source.options.map((value) => String(value || ""))
          : [];
        const answerText = String(source.answer || source.correct || "").trim();
        if (
          answerText &&
          !optionTexts.some((value) => String(value || "").trim().toLowerCase() === answerText.toLowerCase())
        ) {
          optionTexts.push(answerText);
        }
        while (optionTexts.length < desiredCount) {
          optionTexts.push("");
        }
        const optionIds = optionTexts.map((text) => appendPoolOption(text));
        const correctIndex = Math.max(0, Math.min(optionIds.length - 1, toInt(source.correct_index ?? source.correctIndex, 0)));
        const correctOptionId = optionIds[correctIndex] || optionIds[0] || appendPoolOption("");
        return {
          id: blankId,
          correct_option_id: correctOptionId,
          new_option_ids: optionIds,
        };
      });
    }

    if (!optionsPool.length) {
      fallbackContent.options_pool.forEach((option) => {
        optionsPool.push({
          id: normalizeOptionId(option.id, optionsPool.length + 1),
          text: String(option.text || ""),
        });
      });
    }

    const sentenceBlankKeys = extractBlankKeysFromSentence(sentence);
    if (!sentenceBlankKeys.length && blanks.length) {
      if (/_{2,}/.test(sentence)) {
        sentence = sentence.replace(/_{2,}/, `[[${blanks[0].id}]]`);
      } else {
        const seed = sentence || "Complete the sentence";
        sentence = `${seed} [[${blanks[0].id}]]`.trim();
      }
    }

    const orderedKeys = extractBlankKeysFromSentence(sentence);
    const blankById = new Map(blanks.map((blank) => [blank.id, blank]));
    const normalizedBlanks = orderedKeys.map((blankId, idx) => {
      const current = blankById.get(blankId) || {};
      const desiredCount = idx === 0 ? 4 : 2;
      const newOptionIds = normalizeIdList(current.new_option_ids, desiredCount);
      let correctOptionId = String(current.correct_option_id || "").trim();
      if (correctOptionId) {
        correctOptionId = ensurePoolOption(correctOptionId, "");
      }
      if (!correctOptionId || (idx > 0 && !newOptionIds.includes(correctOptionId))) {
        correctOptionId = newOptionIds[0] || appendPoolOption("");
      }
      return {
        id: blankId,
        correct_option_id: correctOptionId,
        new_option_ids: Array.from(new Set(newOptionIds)),
      };
    });

    return {
      sentence,
      blanks: normalizedBlanks.length ? normalizedBlanks : fallbackContent.blanks,
      options_pool: optionsPool,
      point_value: pointValue,
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
      point_value: pointValue,
    };
  }

  if (type === "audio_match") {
    return {
      text_target: String(raw.text_target || base.text_target),
      mode: String(raw.mode || base.mode),
      provider: "elevenlabs",
      audio_url: String(raw.audio_url || ""),
      point_value: pointValue,
    };
  }

  if (type === "image_match") {
    const rawOptions = Array.isArray(raw.options) ? raw.options : [];
    const mappedOptions = rawOptions.map((option) => {
      if (typeof option === "string") {
        return {
          label: String(option).trim(),
          vocab_id: "",
          image_url: "",
        };
      }
      const source = option && typeof option === "object" ? option : {};
      return {
        label: String(
          source.label ||
            source.word_native ||
            source.word_target ||
            source.text ||
            source.option ||
            source.vocab_id ||
            ""
        ).trim(),
        vocab_id: String(source.vocab_id || source.vocabId || "").trim(),
        image_url: String(source.image_url || source.imageUrl || "").trim(),
      };
    });
    const options = Array.from({ length: 4 }, (_, idx) => {
      const source = mappedOptions[idx] || {};
      return {
        label: String(source.label || "").trim(),
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
      question_native: String(raw.question_native || base.question_native),
      image_url: imageUrl,
      options,
      correct_index: Number.isFinite(correctIndex) ? correctIndex : 0,
      correct_vocab_id: options[correctIndex]?.vocab_id || "",
      point_value: pointValue,
    };
  }

  if (type === "pairs") {
    const pairs = Array.isArray(raw.pairs)
      ? raw.pairs
          .map((pair) => ({
            native: String(pair?.native || "").trim(),
            target: String(pair?.target || "").trim(),
          }))
      : base.pairs;
    return {
      pairs: pairs.length ? pairs : base.pairs,
      point_value: pointValue,
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
    skillTag: overrides.skillTag || defaultSkillTagByType(type),
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
  const [newScrambleWord, setNewScrambleWord] = useState("");
  const [scrambleDragIndex, setScrambleDragIndex] = useState(null);
  const clozeSentenceRef = useRef(null);

  if (item.type === "cloze") {
    const blanks = Array.isArray(content.blanks) ? content.blanks : [];
    const optionsPool = Array.isArray(content.options_pool) ? content.options_pool : [];
    const poolMap = new Map(
      optionsPool.map((option) => [String(option?.id || "").trim(), { ...option }])
    );

    const updateBlank = (blankIndex, patchObject) => {
      const next = blanks.map((blank, idx) => {
        if (idx !== blankIndex) return blank;
        return { ...blank, ...patchObject };
      });
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

    const addBlankToken = () => {
      const nextIndex = blanks.length + 1;
      const blankId = normalizeBlankKey(`blank_${nextIndex}`, nextIndex);
      const token = `[[${blankId}]]`;
      const sentence = String(content.sentence || "");
      const node = clozeSentenceRef.current;
      let nextSentence = sentence;
      if (node && typeof node.selectionStart === "number" && typeof node.selectionEnd === "number") {
        const start = node.selectionStart;
        const end = node.selectionEnd;
        nextSentence = `${sentence.slice(0, start)}${token}${sentence.slice(end)}`;
      } else {
        nextSentence = `${sentence}${sentence ? " " : ""}${token}`;
      }
      const nextPool = [...optionsPool];
      const optionCount = blanks.length === 0 ? 4 : 2;
      const newOptionIds = [];
      for (let idx = 0; idx < optionCount; idx += 1) {
        const optionId = getNextOptionId(nextPool);
        nextPool.push({ id: optionId, text: "" });
        newOptionIds.push(optionId);
      }
      const nextBlanks = [...blanks, {
        id: blankId,
        correct_option_id: newOptionIds[0] || "",
        new_option_ids: newOptionIds,
      }];
      onPatch({
        sentence: nextSentence,
        blanks: nextBlanks,
        options_pool: nextPool,
      });
    };

    const addTwoOptionsToBlank = (blankIndex) => {
      const target = blanks[blankIndex];
      if (!target) return;
      const nextPool = [...optionsPool];
      const createdIds = [];
      for (let idx = 0; idx < 2; idx += 1) {
        const optionId = getNextOptionId(nextPool);
        nextPool.push({ id: optionId, text: "" });
        createdIds.push(optionId);
      }
      const currentIds = Array.isArray(target.new_option_ids) ? target.new_option_ids : [];
      const nextIds = Array.from(new Set([...currentIds, ...createdIds]));
      const currentCorrect = String(target.correct_option_id || "").trim();
      const nextBlanks = blanks.map((blank, idx) =>
        idx === blankIndex
          ? {
            ...blank,
            new_option_ids: nextIds,
            correct_option_id: currentCorrect || nextIds[0] || "",
          }
          : blank
      );
      onPatch({
        blanks: nextBlanks,
        options_pool: nextPool,
      });
    };

    const removeBlank = (blankIndex) => {
      const target = blanks[blankIndex];
      if (!target) return;
      const targetBlankId = normalizeBlankKey(target.id || target.key || `blank_${blankIndex + 1}`, blankIndex + 1);
      const nextBlanks = blanks.filter((_, idx) => idx !== blankIndex);
      const tokenRegex = new RegExp(`\\[\\[\\s*${targetBlankId}\\s*\\]\\]`, "gi");
      const nextSentence = String(content.sentence || "")
        .replace(tokenRegex, "____")
        .replace(/\s{2,}/g, " ")
        .trim();

      const removedOptionIds = new Set(
        (Array.isArray(target.new_option_ids) ? target.new_option_ids : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      );
      const stillReferencedIds = new Set(
        nextBlanks.flatMap((blank) => {
          const ids = Array.isArray(blank.new_option_ids) ? blank.new_option_ids : [];
          const correctId = String(blank.correct_option_id || "").trim();
          return [...ids, correctId].map((value) => String(value || "").trim()).filter(Boolean);
        })
      );
      const nextPool = optionsPool.filter((option) => {
        const optionId = String(option?.id || "").trim();
        if (!removedOptionIds.has(optionId)) return true;
        return stillReferencedIds.has(optionId);
      });

      onPatch({
        sentence: nextSentence,
        blanks: nextBlanks,
        options_pool: nextPool,
      });
    };

    return (
      <div className="grid gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Frase</label>
        <textarea
          ref={clozeSentenceRef}
          rows={3}
          value={content.sentence}
          onChange={(event) => onPatch({ sentence: event.target.value })}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Ej: I [[blank_1]] to school and [[blank_2]] English."
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
            Inserta el token en la posicion del cursor. Cada blank nuevo agrega 2 opciones al pool global.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pool global de opciones ({optionsPool.length})</p>
          <p className="mt-1 text-xs text-muted">
            El alumno ve todas las opciones juntas. Cada blank define 1 opcion correcta por ID.
          </p>
        </div>

        <div className="space-y-3">
          {blanks.map((blank, blankIndex) => {
            const blankId = normalizeBlankKey(blank.id || blank.key || `blank_${blankIndex + 1}`, blankIndex + 1);
            const ownOptionIds = Array.from(
              new Set(
                (Array.isArray(blank.new_option_ids) ? blank.new_option_ids : [])
                  .map((value) => String(value || "").trim())
                  .filter(Boolean)
              )
            );
            const selectableOptions = blankIndex === 0
              ? optionsPool
              : optionsPool.filter((option) => ownOptionIds.includes(String(option?.id || "").trim()));
            const currentCorrectId = String(blank.correct_option_id || "").trim();
            const correctIsOutsideRange = blankIndex > 0 && currentCorrectId && !ownOptionIds.includes(currentCorrectId);

            return (
              <div key={`${item.localId}-blank-${blankId}-${blankIndex}`} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Blank {blankIndex + 1} ({blankId})
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addTwoOptionsToBlank(blankIndex)}
                      className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                    >
                      +2 opciones
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlank(blankIndex)}
                      className="rounded-lg border border-danger/60 px-2 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                    >
                      Quitar blank
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Opcion correcta del blank
                  </label>
                  <select
                    value={currentCorrectId}
                    onChange={(event) =>
                      updateBlank(blankIndex, { correct_option_id: event.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-foreground"
                  >
                    {selectableOptions.map((option) => {
                      const optionId = String(option?.id || "").trim();
                      return (
                        <option key={`${item.localId}-blank-correct-${blankId}-${optionId}`} value={optionId}>
                          {optionId} - {String(option?.text || "").trim() || "(sin texto)"}
                        </option>
                      );
                    })}
                  </select>
                  {correctIsOutsideRange ? (
                    <p className="text-xs text-danger">
                      Para este blank, la correcta debe estar dentro de sus opciones nuevas.
                    </p>
                  ) : null}
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {ownOptionIds.map((optionId, optionIndex) => (
                    <div
                      key={`${item.localId}-blank-${blankId}-option-${optionId}-${optionIndex}`}
                      className="grid gap-1 rounded-lg border border-border bg-surface-2 p-2"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Opcion {optionIndex + 1} ({optionId})
                      </p>
                      <input
                        value={String(poolMap.get(optionId)?.text || "")}
                        onChange={(event) => updateOptionText(optionId, event.target.value)}
                        className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground"
                        placeholder="Texto de opcion"
                      />
                    </div>
                  ))}
                </div>
                {!ownOptionIds.length ? (
                  <p className="mt-2 text-xs text-muted">Sin opciones asociadas a este blank.</p>
                ) : null}
              </div>
            );
          })}
        </div>
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
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pares de palabras</p>
        <div className="space-y-2">
          {pairs.map((pair, idx) => (
            <div
              key={`${item.localId}-pair-${idx}`}
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
        <button
          type="button"
          onClick={() => onPatch({ pairs: [...pairs, { native: "", target: "" }] })}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 sm:w-auto"
        >
          + Agregar par
        </button>
      </div>
    );
  }

  return null;
}

export default function TemplateSessionExerciseBuilder({ templateId, templateSessionId }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTemplateSessionExerciseBatch, INITIAL_STATE);
  const [items, setItems] = useState([createDraft()]);
  const [pointWarning, setPointWarning] = useState(null);

  const batchJson = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          type: item.type,
          status: item.status,
          title: item.title,
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

              <div className="mt-3 grid gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo (opcional)</label>
                  <input
                    value={item.title}
                    onChange={(event) => updateItem(item.localId, { title: event.target.value })}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                    placeholder="Prueba de clase"
                  />
                </div>
                <p className="text-xs text-muted">La leccion se asigna automaticamente a esta clase.</p>
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
          {pending ? "Creando prueba..." : `Crear prueba (${items.length} ejercicio${items.length === 1 ? "" : "s"})`}
        </button>
        <p className="text-xs text-muted">Puedes crear una sola tarjeta o una serie completa de ejercicios.</p>
      </div>
    </form>
  );
}
