import { AUDIO_MODES, AUDIO_MODE_VALUES, EXERCISE_TYPES, EXERCISE_TYPE_VALUES } from "./constants.js";

import {
  buildListeningQuestionsFromContent,
  getListeningEndTime,
  getListeningMaxPlays,
  getListeningPrompt,
  getListeningStartTime,
  isYouTubeUrl,
  LISTENING_QUESTION_TYPES,
} from "../listening-exercise.js";

function toPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function cleanArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function toInteger(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizePointValue(value, fallback = 10) {
  const parsed = toNumber(value);
  if (parsed == null) return fallback;
  const clamped = Math.max(0, Math.min(100, parsed));
  return Math.round((clamped + Number.EPSILON) * 100) / 100;
}

function normalizeEstimatedTimeMinutes(value) {
  const parsed = toInteger(value);
  if (parsed == null) return null;
  return Math.max(1, parsed);
}

function normalizeBlankKey(value, fallbackIndex = 1) {
  const raw = cleanText(value).toLowerCase().replace(/\s+/g, "_");
  if (!raw) return `blank_${fallbackIndex}`;
  if (raw.startsWith("blank_")) return raw;
  return `blank_${raw}`;
}

function normalizeOptionId(value, fallbackIndex = 1) {
  const raw = cleanText(value).toLowerCase().replace(/\s+/g, "_");
  if (!raw) return `opt_${fallbackIndex}`;
  if (raw.startsWith("opt_")) return raw;
  return `opt_${raw}`;
}

function extractBlankKeys(sentence = "") {
  const text = cleanText(sentence);
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

function pickUniqueIntegers(values) {
  if (!Array.isArray(values)) return [];
  const picked = [];
  const seen = new Set();
  for (const value of values) {
    const parsed = toInteger(value);
    if (parsed == null || seen.has(parsed)) continue;
    seen.add(parsed);
    picked.push(parsed);
  }
  return picked;
}

function normalizeImageOption(option) {
  if (typeof option === "string") {
    return {
      vocab_id: null,
      image_url: null,
      label: cleanText(option),
    };
  }
  const obj = toPlainObject(option);
  return {
    vocab_id: cleanText(obj.vocab_id || obj.vocabId) || null,
    image_url: cleanText(obj.image_url || obj.imageUrl) || null,
    label: cleanText(
      obj.label ||
        obj.word_native ||
        obj.word_target ||
        obj.text ||
        obj.option ||
        obj.vocab_id ||
        obj.vocabId
    ),
  };
}

function normalizePair(pair) {
  const obj = toPlainObject(pair);
  return {
    native: cleanText(obj.native),
    target: cleanText(obj.target),
  };
}

function normalizeScramble(raw, errors) {
  const content = toPlainObject(raw);
  const promptNative = cleanText(content.prompt_native || content.promptNative);
  const targetWords = cleanArray(content.target_words || content.targetWords);
  const answerOrder = pickUniqueIntegers(content.answer_order || content.answerOrder);

  if (!promptNative) {
    errors.push("Scramble requiere 'prompt_native'.");
  }
  if (targetWords.length < 2) {
    errors.push("Scramble requiere al menos 2 'target_words'.");
  }

  if (answerOrder.length !== targetWords.length) {
    errors.push("Scramble requiere 'answer_order' con el mismo tamaño que 'target_words'.");
  }

  const maxIndex = Math.max(0, targetWords.length - 1);
  for (const index of answerOrder) {
    if (index < 0 || index > maxIndex) {
      errors.push("Scramble contiene índices inválidos en 'answer_order'.");
      break;
    }
  }

  return {
    prompt_native: promptNative,
    target_words: targetWords,
    answer_order: answerOrder,
  };
}

function validateQuestionExerciseQuestions(content, errors, label) {
  const questions = buildListeningQuestionsFromContent(content, { includeFallback: false });

  if (!questions.length) {
    errors.push(`${label} requiere al menos 1 pregunta.`);
  }

  questions.forEach((question, index) => {
    if (!cleanText(question?.prompt)) {
      errors.push(`${label} pregunta ${index + 1} requiere 'prompt'.`);
    }

    if (question?.type === LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE) {
      const options = cleanArray(question?.options);
      if (options.length !== 4) {
        errors.push(`${label} pregunta ${index + 1} (multiple_choice) requiere exactamente 4 opciones.`);
      }
      const correctIndex = toInteger(question?.correct_index);
      if (correctIndex == null || correctIndex < 0 || correctIndex >= 4) {
        errors.push(`${label} pregunta ${index + 1} (multiple_choice) requiere 'correct_index' valido.`);
      }
      return;
    }

    if (question?.type === LISTENING_QUESTION_TYPES.WRITTEN) {
      const acceptedAnswers = cleanArray(question?.accepted_answers);
      if (!acceptedAnswers.length) {
        errors.push(`${label} pregunta ${index + 1} (written) requiere al menos una respuesta valida.`);
      }
      return;
    }

    if (question?.type === LISTENING_QUESTION_TYPES.TRUE_FALSE) {
      if (typeof question?.correct_boolean !== "boolean") {
        errors.push(`${label} pregunta ${index + 1} (true_false) requiere 'correct_boolean'.`);
      }
    }
  });

  return questions;
}

function normalizeAudioMatch(raw, errors) {
  const content = toPlainObject(raw);
  const textTarget = cleanText(content.text_target || content.textTarget);
  const modeCandidate = cleanText(content.mode).toLowerCase() || AUDIO_MODES.DICTATION;
  const mode = AUDIO_MODE_VALUES.includes(modeCandidate) ? modeCandidate : AUDIO_MODES.DICTATION;
  const rawAudioUrl = cleanText(content.audio_url || content.audioUrl);
  const explicitYouTubeUrl = cleanText(content.youtube_url || content.youtubeUrl);
  const youtubeUrl = explicitYouTubeUrl || (isYouTubeUrl(rawAudioUrl) ? rawAudioUrl : "");
  const audioUrl = youtubeUrl ? null : (rawAudioUrl || null);
  const r2Key = youtubeUrl ? null : (cleanText(content.r2_key || content.r2Key) || null);
  const voiceId = youtubeUrl ? null : (cleanText(content.voice_id || content.voiceId) || null);
  const modelId = youtubeUrl ? null : (cleanText(content.model_id || content.modelId) || null);
  const provider = youtubeUrl
    ? "youtube"
    : (cleanText(content.provider || "elevenlabs").toLowerCase() || "elevenlabs");
  const questions = validateQuestionExerciseQuestions(content, errors, "Listening Exercise");
  const maxPlays = getListeningMaxPlays(content, 1);
  const promptNative = getListeningPrompt(content);
  const startTime = getListeningStartTime(content, 0);
  const endTime = getListeningEndTime(content, null);

  if (!youtubeUrl && !audioUrl && !r2Key && !textTarget) {
    errors.push("Listening Exercise requiere un link de YouTube, audio existente o 'text_target' legacy.");
  }

  if (endTime != null && endTime <= startTime) {
    errors.push("Listening Exercise requiere que 'end_time' sea mayor que 'start_time'.");
  }

  const normalized = {
    prompt_native: promptNative,
    provider,
    source_type: youtubeUrl ? "youtube" : (audioUrl || r2Key ? "audio" : "text"),
    youtube_url: youtubeUrl || null,
    audio_url: audioUrl,
    r2_key: r2Key,
    voice_id: voiceId,
    model_id: modelId,
    max_plays: maxPlays,
    start_time: startTime,
    end_time: endTime,
    questions,
  };

  if (textTarget) {
    normalized.text_target = textTarget;
  }
  if (!questions.length && textTarget) {
    normalized.mode = mode;
  }

  return normalized;
}

function normalizeReadingExercise(raw, errors) {
  const content = toPlainObject(raw);
  const title = cleanText(content.title || content.reading_title || content.readingTitle);
  const text = cleanText(content.text || content.reading_text || content.readingText || content.body || content.passage);
  const imageUrl = cleanText(content.image_url || content.imageUrl) || null;
  const questions = validateQuestionExerciseQuestions(content, errors, "Reading Exercise");

  if (!title) {
    errors.push("Reading Exercise requiere 'title'.");
  }

  if (!text) {
    errors.push("Reading Exercise requiere 'text'.");
  }

  return {
    title,
    text,
    image_url: imageUrl,
    questions,
  };
}

function normalizeImageMatch(raw, errors) {
  const content = toPlainObject(raw);
  const questionNative = cleanText(content.question_native || content.questionNative);
  const rawOptions = Array.isArray(content.options) ? content.options.map(normalizeImageOption) : [];
  const options = Array.from({ length: 4 }, (_, idx) => {
    const option = rawOptions[idx] || {};
    return {
      vocab_id: cleanText(option.vocab_id) || null,
      image_url: cleanText(option.image_url) || null,
      label: cleanText(option.label),
    };
  });
  const imageUrl = cleanText(content.image_url || content.imageUrl) || null;
  const correctVocabId = cleanText(content.correct_vocab_id || content.correctVocabId) || null;
  const correctIndexInput = toInteger(content.correct_index ?? content.correctIndex);

  if (!questionNative) {
    errors.push("Image Match requiere 'question_native'.");
  }

  if (rawOptions.length !== 4) {
    errors.push("Image Match requiere exactamente 4 opciones.");
  }

  const optionLabels = options.map((option) => option.label).filter(Boolean);
  if (optionLabels.length < options.length) {
    errors.push("Image Match requiere texto en cada opcion.");
  }

  const vocabIds = options.map((option) => option.vocab_id).filter(Boolean);
  let resolvedCorrectIndex = correctIndexInput;
  if (correctVocabId) {
    const byVocab = options.findIndex((option) => option.vocab_id === correctVocabId);
    if (byVocab >= 0) {
      resolvedCorrectIndex = byVocab;
    }
  }

  if (resolvedCorrectIndex == null || resolvedCorrectIndex < 0 || resolvedCorrectIndex >= options.length) {
    errors.push("Image Match requiere 'correct_vocab_id' o 'correct_index' válido.");
  }
  if (correctVocabId && vocabIds.length && !vocabIds.includes(correctVocabId)) {
    errors.push("Image Match 'correct_vocab_id' debe existir en opciones.");
  }

  const fallbackImage =
    resolvedCorrectIndex != null && resolvedCorrectIndex >= 0 && resolvedCorrectIndex < options.length
      ? options[resolvedCorrectIndex].image_url
      : null;
  const resolvedImageUrl = imageUrl || fallbackImage || null;
  if (!resolvedImageUrl) {
    errors.push("Image Match requiere 'image_url' principal.");
  }

  return {
    question_native: questionNative,
    image_url: resolvedImageUrl,
    options: options.map((option) => ({
      label: option.label,
      vocab_id: option.vocab_id,
    })),
    correct_vocab_id:
      correctVocabId ||
      (resolvedCorrectIndex != null && resolvedCorrectIndex >= 0 && resolvedCorrectIndex < options.length
        ? options[resolvedCorrectIndex].vocab_id
        : null),
    correct_index: resolvedCorrectIndex,
  };
}

function normalizePairs(raw, errors) {
  const content = toPlainObject(raw);
  const pairs = Array.isArray(content.pairs) ? content.pairs.map(normalizePair) : [];

  if (pairs.length < 2) {
    errors.push("Pairs requiere al menos 2 pares.");
  }

  for (const pair of pairs) {
    if (!pair.native || !pair.target) {
      errors.push("Cada par en Pairs requiere campos 'native' y 'target'.");
      break;
    }
  }

  return { pairs };
}

function normalizeCloze(raw, errors) {
  const content = toPlainObject(raw);
  let sentence = cleanText(content.sentence);
  const optionsPool = [];
  const appendOption = (text = "") => {
    let nextIndex = 1;
    const seen = new Set(optionsPool.map((option) => option.id));
    while (seen.has(`opt_${nextIndex}`)) {
      nextIndex += 1;
    }
    const optionId = `opt_${nextIndex}`;
    optionsPool.push({ id: optionId, text: cleanText(text) });
    return optionId;
  };
  const ensureOption = (optionId, fallbackText = "") => {
    const safeId = normalizeOptionId(optionId, optionsPool.length + 1);
    const existing = optionsPool.find((option) => option.id === safeId);
    if (existing) {
      if (!cleanText(existing.text) && cleanText(fallbackText)) {
        existing.text = cleanText(fallbackText);
      }
      return safeId;
    }
    optionsPool.push({ id: safeId, text: cleanText(fallbackText) });
    return safeId;
  };
  const normalizeOptionIdList = (values, minCount = 0) => {
    const ids = Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((value) => cleanText(value))
          .filter(Boolean)
          .map((value) => ensureOption(value, ""))
      )
    );
    while (ids.length < minCount) {
      ids.push(appendOption(""));
    }
    return ids;
  };

  const rawPool = Array.isArray(content.options_pool)
    ? content.options_pool
    : (Array.isArray(content.optionsPool) ? content.optionsPool : []);
  rawPool.forEach((entry) => {
    if (typeof entry === "string") {
      appendOption(entry);
      return;
    }
    const source = toPlainObject(entry);
    ensureOption(
      source.id || source.option_id || source.optionId || "",
      source.text || source.value || source.label || ""
    );
  });

  const rawBlanks = Array.isArray(content.blanks) ? content.blanks : [];
  const hasPoolShape =
    rawPool.length > 0 ||
    rawBlanks.some((blank) => {
      const source = toPlainObject(blank);
      return (
        source.correct_option_id != null ||
        source.correctOptionId != null ||
        source.new_option_ids != null ||
        source.newOptionIds != null
      );
    });

  let blanks = [];

  if (hasPoolShape) {
    blanks = rawBlanks.map((blank, idx) => {
      const source = toPlainObject(blank);
      const blankId = normalizeBlankKey(source.id || source.key, idx + 1);
      const minOptions = idx === 0 ? 4 : 2;
      let newOptionIds = normalizeOptionIdList(source.new_option_ids || source.newOptionIds, minOptions);
      if (!newOptionIds.length && optionsPool.length) {
        newOptionIds = normalizeOptionIdList(optionsPool.slice(0, minOptions).map((option) => option.id), minOptions);
      }

      let correctOptionId = cleanText(source.correct_option_id || source.correctOptionId);
      if (correctOptionId) {
        correctOptionId = ensureOption(correctOptionId, "");
      }
      if (!correctOptionId && newOptionIds.length) {
        const byIndex = Math.max(0, Math.min(newOptionIds.length - 1, toInteger(source.correct_index ?? source.correctIndex) ?? 0));
        correctOptionId = newOptionIds[byIndex];
      }
      if (!correctOptionId) {
        const answer = cleanText(source.answer || source.correct);
        if (answer) {
          const existingByText = optionsPool.find((option) => cleanText(option.text).toLowerCase() === answer.toLowerCase());
          correctOptionId = existingByText?.id || appendOption(answer);
          if (!newOptionIds.includes(correctOptionId)) {
            newOptionIds.push(correctOptionId);
          }
        }
      }
      if (!correctOptionId) {
        correctOptionId = newOptionIds[0] || appendOption("");
      }
      if (idx > 0 && !newOptionIds.includes(correctOptionId)) {
        errors.push(`Fill in the blanks: blank ${idx + 1} requiere correcta dentro de sus opciones nuevas.`);
        correctOptionId = newOptionIds[0] || appendOption("");
      }

      return {
        id: blankId,
        correct_option_id: correctOptionId,
        new_option_ids: Array.from(new Set(newOptionIds)),
      };
    });
  }

  if (!blanks.length) {
    const legacyBlanks = rawBlanks.length
      ? rawBlanks
      : [{
        key: "blank_1",
        options: cleanArray(content.options),
        correct_index: toInteger(content.correct_index ?? content.correctIndex),
        answer: cleanText(content.answer || content.correct),
      }];

    blanks = legacyBlanks.map((blank, idx) => {
      const source = toPlainObject(blank);
      const blankId = normalizeBlankKey(source.key || source.id, idx + 1);
      const minOptions = idx === 0 ? 4 : 2;
      const optionTexts = cleanArray(source.options);
      const answer = cleanText(source.answer || source.correct);
      if (answer && !optionTexts.some((option) => option.toLowerCase() === answer.toLowerCase())) {
        optionTexts.push(answer);
      }
      while (optionTexts.length < minOptions) {
        optionTexts.push("");
      }
      const newOptionIds = optionTexts.map((text) => appendOption(text));
      const correctIndex = Math.max(0, Math.min(newOptionIds.length - 1, toInteger(source.correct_index ?? source.correctIndex) ?? 0));
      const correctOptionId = newOptionIds[correctIndex] || newOptionIds[0] || appendOption("");
      return {
        id: blankId,
        correct_option_id: correctOptionId,
        new_option_ids: newOptionIds,
      };
    });
  }

  if (!sentence) {
    errors.push("Fill in the blanks requiere 'sentence'.");
  }

  if (!blanks.length) {
    errors.push("Fill in the blanks requiere al menos 1 blank.");
  }

  if (!extractBlankKeys(sentence).length && blanks.length) {
    if (/_{2,}/.test(sentence)) {
      sentence = sentence.replace(/_{2,}/, `[[${blanks[0].id}]]`);
    } else if (sentence) {
      sentence = `${sentence} [[${blanks[0].id}]]`.trim();
    } else {
      sentence = `Complete the sentence [[${blanks[0].id}]]`;
    }
  }

  const orderedKeys = extractBlankKeys(sentence);
  const blankByKey = new Map(blanks.map((blank) => [blank.id, blank]));
  const orderedBlanks = orderedKeys.map((key, idx) => {
    const blank = blankByKey.get(key) || {};
    const minOptions = idx === 0 ? 4 : 2;
    const optionIds = normalizeOptionIdList(blank.new_option_ids, minOptions);
    let correctOptionId = cleanText(blank.correct_option_id);
    if (correctOptionId) {
      correctOptionId = ensureOption(correctOptionId, "");
    }
    if (!correctOptionId) {
      correctOptionId = optionIds[0] || appendOption("");
    }
    return {
      id: normalizeBlankKey(key, idx + 1),
      correct_option_id: correctOptionId,
      new_option_ids: optionIds,
    };
  });

  if (!orderedBlanks.length) {
    errors.push("Fill in the blanks requiere tokens [[blank_x]] en la frase.");
  }

  orderedBlanks.forEach((blank, idx) => {
    const minOptions = idx === 0 ? 4 : 2;
    if (blank.new_option_ids.length < minOptions) {
      errors.push(`Fill in the blanks: blank ${idx + 1} requiere al menos ${minOptions} opciones.`);
    }
    if (!blank.correct_option_id) {
      errors.push(`Fill in the blanks: blank ${idx + 1} requiere 'correct_option_id' válido.`);
    }
    if (idx > 0 && !blank.new_option_ids.includes(blank.correct_option_id)) {
      errors.push(`Fill in the blanks: blank ${idx + 1} debe usar correcta dentro de sus opciones nuevas.`);
    }
  });

  return {
    sentence,
    options_pool: optionsPool,
    blanks: orderedBlanks,
  };
}

export function normalizeExerciseType(value) {
  const normalized = cleanText(value).toLowerCase();
  return EXERCISE_TYPE_VALUES.includes(normalized) ? normalized : null;
}

export function parseContentJson(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return toPlainObject(parsed);
    } catch {
      return null;
    }
  }
  return toPlainObject(raw);
}

export function validateExerciseContent({ type, contentJson }) {
  const errors = [];
  const normalizedType = normalizeExerciseType(type);

  if (!normalizedType) {
    return {
      valid: false,
      errors: ["Tipo de ejercicio inválido."],
      normalizedType: null,
      normalizedContent: {},
    };
  }

  const parsedContent = parseContentJson(contentJson);
  if (parsedContent == null) {
    return {
      valid: false,
      errors: ["content_json no es JSON válido."],
      normalizedType,
      normalizedContent: {},
    };
  }

  let normalizedContent = {};

  switch (normalizedType) {
    case EXERCISE_TYPES.SCRAMBLE:
      normalizedContent = normalizeScramble(parsedContent, errors);
      break;
    case EXERCISE_TYPES.AUDIO_MATCH:
      normalizedContent = normalizeAudioMatch(parsedContent, errors);
      break;
    case EXERCISE_TYPES.READING_EXERCISE:
      normalizedContent = normalizeReadingExercise(parsedContent, errors);
      break;
    case EXERCISE_TYPES.IMAGE_MATCH:
      normalizedContent = normalizeImageMatch(parsedContent, errors);
      break;
    case EXERCISE_TYPES.PAIRS:
      normalizedContent = normalizePairs(parsedContent, errors);
      break;
    case EXERCISE_TYPES.CLOZE:
      normalizedContent = normalizeCloze(parsedContent, errors);
      break;
    default:
      errors.push("Tipo de ejercicio no soportado.");
      normalizedContent = parsedContent;
  }

  normalizedContent.point_value = normalizePointValue(
    parsedContent.point_value ?? parsedContent.pointValue,
    10
  );
  const estimatedTimeMinutes = normalizeEstimatedTimeMinutes(
    parsedContent.estimated_time_minutes ?? parsedContent.estimatedTimeMinutes
  );
  if (estimatedTimeMinutes != null) {
    normalizedContent.estimated_time_minutes = estimatedTimeMinutes;
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedType,
    normalizedContent,
  };
}

export function isPublishableExercise({ type, contentJson }) {
  const result = validateExerciseContent({ type, contentJson });
  return {
    publishable: result.valid,
    errors: result.errors,
    normalizedContent: result.normalizedContent,
    normalizedType: result.normalizedType,
  };
}

export function validateLessonPublishable(lesson, exercises) {
  const list = Array.isArray(exercises) ? exercises : [];
  const errors = [];

  if (!lesson?.id) {
    errors.push("Lección inválida.");
  }

  if (!cleanText(lesson?.title)) {
    errors.push("La lección debe tener título.");
  }

  if (!list.length) {
    errors.push("No se puede publicar una lección sin ejercicios.");
  }

  for (const exercise of list) {
    const validation = validateExerciseContent({
      type: exercise?.type,
      contentJson: exercise?.content_json,
    });

    if (!validation.valid) {
      errors.push(`Ejercicio ${exercise?.id || "nuevo"} inválido: ${validation.errors.join(" ")}`);
    }

    if (exercise?.status !== "published") {
      errors.push(`Ejercicio ${exercise?.id || "nuevo"} no está publicado.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function toPreviewModel(exercise) {
  const type = normalizeExerciseType(exercise?.type);
  const content = parseContentJson(exercise?.content_json) || {};
  return {
    id: exercise?.id || null,
    type,
    status: cleanText(exercise?.status) || "draft",
    lesson_id: exercise?.lesson_id || null,
    content,
    prompt:
      content.title ||
      content.reading_title ||
      content.text ||
      content.reading_text ||
      content.prompt_native ||
      content.question_native ||
      content.sentence ||
      content.text_target ||
      "",
  };
}
