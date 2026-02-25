import { AUDIO_MODES, AUDIO_MODE_VALUES, EXERCISE_TYPES, EXERCISE_TYPE_VALUES } from "./constants.js";

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
  const obj = toPlainObject(option);
  return {
    vocab_id: cleanText(obj.vocab_id || obj.vocabId) || null,
    image_url: cleanText(obj.image_url || obj.imageUrl) || null,
    label: cleanText(obj.label),
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

function normalizeAudioMatch(raw, errors) {
  const content = toPlainObject(raw);
  const textTarget = cleanText(content.text_target || content.textTarget);
  const modeCandidate = cleanText(content.mode).toLowerCase() || AUDIO_MODES.DICTATION;
  const mode = AUDIO_MODE_VALUES.includes(modeCandidate) ? modeCandidate : AUDIO_MODES.DICTATION;
  const provider = cleanText(content.provider || "elevenlabs").toLowerCase();
  const audioUrl = cleanText(content.audio_url || content.audioUrl) || null;
  const r2Key = cleanText(content.r2_key || content.r2Key) || null;
  const voiceId = cleanText(content.voice_id || content.voiceId) || null;
  const modelId = cleanText(content.model_id || content.modelId) || null;
  const options = cleanArray(content.options);
  const correctIndex = toInteger(content.correct_index ?? content.correctIndex);

  if (!textTarget) {
    errors.push("Audio Match requiere 'text_target'.");
  }

  if (mode === AUDIO_MODES.TRANSLATION) {
    if (options.length < 2) {
      errors.push("Audio Match (translation) requiere al menos 2 opciones.");
    }
    if (correctIndex == null || correctIndex < 0 || correctIndex >= options.length) {
      errors.push("Audio Match (translation) requiere 'correct_index' válido.");
    }
  }

  return {
    text_target: textTarget,
    mode,
    provider,
    audio_url: audioUrl,
    r2_key: r2Key,
    voice_id: voiceId,
    model_id: modelId,
    options,
    correct_index: correctIndex,
  };
}

function normalizeImageMatch(raw, errors) {
  const content = toPlainObject(raw);
  const questionNative = cleanText(content.question_native || content.questionNative);
  const options = Array.isArray(content.options) ? content.options.map(normalizeImageOption) : [];
  const correctVocabId = cleanText(content.correct_vocab_id || content.correctVocabId) || null;
  const correctIndex = toInteger(content.correct_index ?? content.correctIndex);

  if (!questionNative) {
    errors.push("Image Match requiere 'question_native'.");
  }

  if (options.length !== 4) {
    errors.push("Image Match requiere exactamente 4 opciones.");
  }

  const optionsWithImage = options.filter((option) => option.image_url);
  if (optionsWithImage.length < options.length) {
    errors.push("Image Match requiere 'image_url' en cada opción.");
  }

  const vocabIds = options.map((option) => option.vocab_id).filter(Boolean);
  if (!correctVocabId && (correctIndex == null || correctIndex < 0 || correctIndex >= options.length)) {
    errors.push("Image Match requiere 'correct_vocab_id' o 'correct_index' válido.");
  }
  if (correctVocabId && !vocabIds.includes(correctVocabId)) {
    errors.push("Image Match 'correct_vocab_id' debe existir en opciones.");
  }

  return {
    question_native: questionNative,
    options,
    correct_vocab_id: correctVocabId,
    correct_index: correctIndex,
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
  const sentence = cleanText(content.sentence);
  const options = cleanArray(content.options);
  const correctIndex = toInteger(content.correct_index ?? content.correctIndex);
  const answer = cleanText(content.answer);

  if (!sentence) {
    errors.push("Fill in the blanks requiere 'sentence'.");
  }

  const hasOptions = options.length > 0;
  if (hasOptions) {
    if (correctIndex == null || correctIndex < 0 || correctIndex >= options.length) {
      errors.push("Fill in the blanks con opciones requiere 'correct_index' válido.");
    }
  } else if (!answer) {
    errors.push("Fill in the blanks requiere 'answer' o lista de 'options'.");
  }

  return {
    sentence,
    options,
    correct_index: correctIndex,
    answer,
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
      content.prompt_native ||
      content.question_native ||
      content.sentence ||
      content.text_target ||
      "",
  };
}

