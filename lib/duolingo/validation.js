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
import {
  extractBlankKeys as extractClozeBlankKeys,
  normalizeBlankKey as normalizeClozeBlankKey,
  tokenizeClozeSentence,
} from "../cloze-blanks.js";

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

function preserveExplanation(value) {
  if (value == null) return "";
  return String(value);
}

function preserveClozeExplanations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const next = {};
  for (const [rawKey, rawText] of Object.entries(value)) {
    const key = cleanText(rawKey);
    if (!key) continue;
    next[key] = rawText == null ? "" : String(rawText);
  }
  return Object.keys(next).length ? next : null;
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
  return normalizeClozeBlankKey(value, fallbackIndex);
}

function normalizeOptionId(value, fallbackIndex = 1) {
  const raw = cleanText(value).toLowerCase().replace(/\s+/g, "_");
  if (!raw) return `opt_${fallbackIndex}`;
  if (raw.startsWith("opt_")) return raw;
  return `opt_${raw}`;
}

function extractBlankKeys(sentence = "") {
  return extractClozeBlankKeys(sentence);
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
    listening_title: cleanText(content.listening_title || content.listeningTitle || content.title),
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
    reading_title: title,
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
  const pairsTitle = cleanText(content.pairs_title || content.pairsTitle || content.title);
  const pairs = Array.isArray(content.pairs)
    ? content.pairs.map((pair, index) => ({
      id: cleanText(pair?.id) || `pair_${index + 1}`,
      ...normalizePair(pair),
    }))
    : [];

  if (!pairsTitle) {
    errors.push("Pairs requiere 'pairs_title'.");
  }

  if (pairs.length < 2) {
    errors.push("Pairs requiere al menos 2 pares.");
  }

  for (const pair of pairs) {
    if (!pair.native || !pair.target) {
      errors.push("Cada par en Pairs requiere campos 'native' y 'target'.");
      break;
    }
  }

  return {
    pairs_title: pairsTitle,
    pairs,
  };
}

function normalizeCloze(raw, errors) {
  const content = toPlainObject(raw);
  let sentence = content.sentence == null ? "" : String(content.sentence);
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
    const rawId = cleanText(optionId);
    const safeId = rawId ? normalizeOptionId(rawId, optionsPool.length + 1) : `opt_${optionsPool.length + 1}`;
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
  const resolveCorrectOptionId = (source = {}, fallbackOptionIds = []) => {
    let correctOptionId = cleanText(source.correct_option_id || source.correctOptionId);
    if (correctOptionId) {
      return ensureOption(correctOptionId, "");
    }

    const answer = cleanText(source.answer || source.correct);
    if (answer) {
      const existingByText = optionsPool.find((option) => cleanText(option.text).toLowerCase() === answer.toLowerCase());
      return existingByText?.id || appendOption(answer);
    }

    const correctIndex = toInteger(source.correct_index ?? source.correctIndex);
    if (correctIndex != null && correctIndex >= 0 && correctIndex < fallbackOptionIds.length) {
      return fallbackOptionIds[correctIndex];
    }

    return null;
  };

  const blanks = rawBlanks.map((blank, idx) => {
    const source = toPlainObject(blank);
    return {
      id: normalizeBlankKey(source.id || source.key, idx + 1),
      correct_option_id: resolveCorrectOptionId(source),
    };
  });

  if (!blanks.length) {
    const legacyOptionTexts = cleanArray(content.options);
    const hasLegacyBlank =
      legacyOptionTexts.length > 0 ||
      content.answer != null ||
      content.correct != null ||
      content.correct_index != null ||
      content.correctIndex != null;

    if (hasLegacyBlank) {
      const legacyOptionIds = legacyOptionTexts.map((text) => appendOption(text));
      blanks.push({
        id: normalizeBlankKey("blank_1", 1),
        correct_option_id: resolveCorrectOptionId(content, legacyOptionIds),
      });
    }
  }

  if (!optionsPool.length) {
    appendOption("");
  }

  if (!String(sentence || "").trim()) {
    errors.push("Fill in the blanks requiere 'sentence'.");
  }

  if (!blanks.length) {
    errors.push("Fill in the blanks requiere al menos 1 blank.");
  }

  const tokenized = tokenizeClozeSentence(
    sentence,
    blanks.map((blank, index) => normalizeBlankKey(blank?.id, index + 1))
  );
  sentence = tokenized.sentence;

  const orderedKeys = tokenized.orderedKeys;
  const blankByKey = new Map(blanks.map((blank) => [blank.id, blank]));
  const orderedBlanks = orderedKeys
    .map((key, idx) => {
      const blank = blankByKey.get(key);
      if (!blank) return null;
      return {
        id: normalizeBlankKey(key, idx + 1),
        correct_option_id: blank.correct_option_id || null,
      };
    })
    .filter(Boolean);

  optionsPool.forEach((option, idx) => {
    if (!cleanText(option.text)) {
      errors.push(`Fill in the blanks: opcion ${idx + 1} requiere texto.`);
    }
  });

  orderedBlanks.forEach((blank, idx) => {
    if (!blank.correct_option_id) {
      errors.push(`Fill in the blanks: blank ${idx + 1} requiere 'correct_option_id' válido.`);
    }
    if (
      blank.correct_option_id &&
      !optionsPool.some((option) => option.id === blank.correct_option_id)
    ) {
      errors.push(`Fill in the blanks: blank ${idx + 1} debe apuntar a una opcion existente del pool.`);
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

  normalizedContent.explanation = preserveExplanation(parsedContent.explanation);
  if (normalizedType === EXERCISE_TYPES.CLOZE) {
    const clozeExplanations = preserveClozeExplanations(parsedContent.explanations);
    if (clozeExplanations) {
      normalizedContent.explanations = clozeExplanations;
    }
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
      content.listening_title ||
      content.pairs_title ||
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
