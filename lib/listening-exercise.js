export const LISTENING_QUESTION_TYPES = {
  MULTIPLE_CHOICE: "multiple_choice",
  WRITTEN: "written",
  TRUE_FALSE: "true_false",
};

export const LISTENING_QUESTION_TYPE_VALUES = Object.values(LISTENING_QUESTION_TYPES);

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function readText(value, options = {}) {
  if (value == null) return "";
  return options.preserveDraftText ? String(value) : cleanText(value);
}

function pickTextValue(source, keys, options = {}) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
      return readText(source[key], options);
    }
  }
  return undefined;
}

function cleanOptionLabel(option, options = {}) {
  if (option == null) return "";
  if (typeof option === "string") return readText(option, options);
  if (typeof option !== "object") return "";
  return (
    pickTextValue(option, ["label", "text", "value", "option"], options) ||
    ""
  );
}

function toInteger(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

export function parseListeningTimeValue(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const raw = String(value).trim();
  if (!raw) return fallback;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.max(0, Math.round(Number(raw)));
  }

  const parts = raw.split(":").map((item) => item.trim());
  if (!parts.length || parts.some((part) => !/^\d+$/.test(part))) {
    return fallback;
  }

  const numbers = parts.map((part) => Number(part));
  if (parts.length === 2) {
    const [minutes, seconds] = numbers;
    return Math.max(0, (minutes * 60) + seconds);
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = numbers;
    return Math.max(0, (hours * 3600) + (minutes * 60) + seconds);
  }

  return fallback;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return null;
  if (["true", "t", "1", "yes", "y", "verdadero", "v"].includes(normalized)) return true;
  if (["false", "f", "0", "no", "n", "falso"].includes(normalized)) return false;
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function uniqueTextList(values, options = {}) {
  if (options.preserveDraftText) {
    return (Array.isArray(values) ? values : []).map((item) => readText(item, options));
  }

  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => readText(item, options))
        .filter(Boolean)
    )
  );
}

function ensureQuestionId(value, index = 0) {
  const raw = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (raw) return raw.startsWith("q_") ? raw : `q_${raw}`;
  return `q_${index + 1}`;
}

export function normalizeExerciseText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeListeningQuestionType(value) {
  const raw = cleanText(value).toLowerCase().replace(/\s+/g, "_");
  if (raw === "mcq" || raw === "multiplechoice") return LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE;
  if (raw === "text" || raw === "short_answer" || raw === "shortanswer") return LISTENING_QUESTION_TYPES.WRITTEN;
  if (raw === "boolean") return LISTENING_QUESTION_TYPES.TRUE_FALSE;
  return LISTENING_QUESTION_TYPE_VALUES.includes(raw)
    ? raw
    : LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE;
}

export function createDefaultListeningQuestion(type = LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE, index = 0) {
  const resolvedType = normalizeListeningQuestionType(type);
  const baseId = ensureQuestionId("", index);
  if (resolvedType === LISTENING_QUESTION_TYPES.WRITTEN) {
    return {
      id: baseId,
      type: resolvedType,
      prompt: `Question ${index + 1}`,
      accepted_answers: [""],
    };
  }
  if (resolvedType === LISTENING_QUESTION_TYPES.TRUE_FALSE) {
    return {
      id: baseId,
      type: resolvedType,
      prompt: `Question ${index + 1}`,
      correct_boolean: true,
    };
  }
  return {
    id: baseId,
    type: LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE,
    prompt: `Question ${index + 1}`,
    options: ["", "", "", ""],
    correct_index: 0,
  };
}

export function normalizeListeningQuestion(question, index = 0, options = {}) {
  const source = question && typeof question === "object" && !Array.isArray(question) ? question : {};
  const type = normalizeListeningQuestionType(source.type || source.kind);
  const fallback = createDefaultListeningQuestion(type, index);
  const id = ensureQuestionId(source.id || source.question_id || source.questionId, index);
  const promptValue = pickTextValue(source, ["prompt", "question", "statement", "text"], options);
  const prompt = promptValue !== undefined
    ? (options.allowBlankPrompt ? promptValue : (promptValue || fallback.prompt))
    : fallback.prompt;

  if (type === LISTENING_QUESTION_TYPES.WRITTEN) {
    const explicitAcceptedAnswers = Array.isArray(source.accepted_answers)
      ? source.accepted_answers
      : (Array.isArray(source.acceptedAnswers) ? source.acceptedAnswers : null);
    const acceptedAnswers = explicitAcceptedAnswers
      ? uniqueTextList(explicitAcceptedAnswers, options)
      : uniqueTextList([
        source.correct_answer,
        source.correctAnswer,
        source.answer,
        source.correct,
      ], options);

    return {
      id,
      type,
      prompt,
      accepted_answers: explicitAcceptedAnswers
        ? acceptedAnswers
        : (acceptedAnswers.length ? acceptedAnswers : fallback.accepted_answers),
    };
  }

  if (type === LISTENING_QUESTION_TYPES.TRUE_FALSE) {
    const correctBoolean = toBoolean(
      source.correct_boolean ?? source.correctBoolean ?? source.answer ?? source.correct ?? source.value
    );

    return {
      id,
      type,
      prompt,
      correct_boolean: correctBoolean == null ? fallback.correct_boolean : correctBoolean,
    };
  }

  const rawOptions = Array.isArray(source.options)
    ? source.options
    : (Array.isArray(source.choices) ? source.choices : []);
  const questionOptions = Array.from({ length: 4 }, (_, optionIndex) =>
    cleanOptionLabel(rawOptions[optionIndex] ?? fallback.options[optionIndex] ?? "", options)
  );
  const correctIndex = clamp(
    toInteger(source.correct_index ?? source.correctIndex, fallback.correct_index),
    0,
    3
  );

  return {
    id,
    type: LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE,
    prompt,
    options: questionOptions,
    correct_index: correctIndex,
  };
}

function buildLegacyListeningQuestion(content = {}) {
  const mode = cleanText(content.mode).toLowerCase();
  const prompt = cleanText(content.question_prompt || content.question || content.text_target);
  const options = Array.isArray(content.options) ? content.options.map(cleanOptionLabel).filter(Boolean) : [];
  const correctIndexFromContent = toInteger(content.correct_index ?? content.correctIndex, null);
  const correctText = cleanText(content.correct || content.answer || content.text_target);

  if (mode === "translation" || mode === "choice" || options.length) {
    let resolvedCorrectIndex = correctIndexFromContent;
    if (resolvedCorrectIndex == null && correctText) {
      const byText = options.findIndex((option) => normalizeExerciseText(option) === normalizeExerciseText(correctText));
      if (byText >= 0) resolvedCorrectIndex = byText;
    }

    return normalizeListeningQuestion(
      {
        type: LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE,
        prompt: prompt || "Choose the correct answer.",
        options,
        correct_index: resolvedCorrectIndex == null ? 0 : resolvedCorrectIndex,
      },
      0
    );
  }

  if (correctText) {
    return normalizeListeningQuestion(
      {
        type: LISTENING_QUESTION_TYPES.WRITTEN,
        prompt: prompt || "Write what you hear.",
        accepted_answers: [correctText],
      },
      0
    );
  }

  return null;
}

export function buildListeningQuestionsFromContent(content = {}, options = {}) {
  const includeFallback = options.includeFallback !== false;
  const rawQuestions = Array.isArray(content?.questions) ? content.questions : [];
  if (rawQuestions.length) {
    return rawQuestions.map((question, index) => normalizeListeningQuestion(question, index, options));
  }

  const legacy = buildLegacyListeningQuestion(content);
  if (legacy) return [legacy];
  return includeFallback ? [createDefaultListeningQuestion(LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE, 0)] : [];
}

export function getListeningPrompt(content = {}) {
  return (
    cleanText(content.prompt_native || content.promptNative || content.instructions) ||
    cleanText(content.text_target) ||
    "Listen to the audio and answer the questions."
  );
}

export function getListeningMaxPlays(content = {}, fallback = 1) {
  const parsed = toInteger(content.max_plays ?? content.maxPlays, fallback);
  return Math.max(1, parsed == null ? fallback : parsed);
}

export function getListeningStartTime(content = {}, fallback = 0) {
  const parsed = parseListeningTimeValue(content.start_time ?? content.startTime, fallback);
  if (parsed == null) return fallback;
  return Math.max(0, parsed);
}

export function getListeningEndTime(content = {}, fallback = null) {
  const parsed = parseListeningTimeValue(content.end_time ?? content.endTime, fallback);
  if (parsed == null) return fallback;
  return Math.max(0, parsed);
}

export function isListeningQuestionAnswered(question, answer) {
  const resolvedQuestion = normalizeListeningQuestion(question);
  const source = answer && typeof answer === "object" && !Array.isArray(answer) ? answer : {};

  if (resolvedQuestion.type === LISTENING_QUESTION_TYPES.WRITTEN) {
    return Boolean(cleanText(source.text || source.value || answer));
  }

  if (resolvedQuestion.type === LISTENING_QUESTION_TYPES.TRUE_FALSE) {
    return toBoolean(source.value ?? source.answer ?? source.selected ?? answer) != null;
  }

  return toInteger(source.selected_index ?? source.selectedIndex ?? answer, null) != null;
}

export function evaluateListeningQuestion(question, answer) {
  const resolvedQuestion = normalizeListeningQuestion(question);
  const source = answer && typeof answer === "object" && !Array.isArray(answer) ? answer : {};

  if (resolvedQuestion.type === LISTENING_QUESTION_TYPES.WRITTEN) {
    const actual = normalizeExerciseText(source.text || source.value || answer);
    if (!actual) return false;
    return resolvedQuestion.accepted_answers.some(
      (expected) => actual === normalizeExerciseText(expected)
    );
  }

  if (resolvedQuestion.type === LISTENING_QUESTION_TYPES.TRUE_FALSE) {
    const selected = toBoolean(source.value ?? source.answer ?? source.selected ?? answer);
    return selected != null && selected === Boolean(resolvedQuestion.correct_boolean);
  }

  const selectedIndex = toInteger(source.selected_index ?? source.selectedIndex ?? answer, null);
  return selectedIndex != null && selectedIndex === Number(resolvedQuestion.correct_index);
}

export function summarizeListeningQuestionResults(questions = [], answersById = {}) {
  const list = Array.isArray(questions) ? questions.map((question, index) => normalizeListeningQuestion(question, index)) : [];
  const safeAnswers = answersById && typeof answersById === "object" ? answersById : {};
  const results = list.map((question, index) => {
    const key = cleanText(question.id) || ensureQuestionId("", index);
    const answer = safeAnswers[key];
    const answered = isListeningQuestionAnswered(question, answer);
    const isCorrect = answered && evaluateListeningQuestion(question, answer);
    return {
      id: key,
      answered,
      isCorrect,
      question,
    };
  });

  return {
    total: results.length,
    answeredCount: results.filter((item) => item.answered).length,
    correctCount: results.filter((item) => item.isCorrect).length,
    complete: results.every((item) => item.answered),
    results,
  };
}

export function getListeningQuestionCorrectAnswerText(question) {
  const resolvedQuestion = normalizeListeningQuestion(question);
  if (resolvedQuestion.type === LISTENING_QUESTION_TYPES.WRITTEN) {
    return resolvedQuestion.accepted_answers.filter(Boolean).join(" / ") || "-";
  }
  if (resolvedQuestion.type === LISTENING_QUESTION_TYPES.TRUE_FALSE) {
    return resolvedQuestion.correct_boolean ? "True" : "False";
  }
  return cleanText(resolvedQuestion.options[resolvedQuestion.correct_index]) || `Option ${resolvedQuestion.correct_index + 1}`;
}

export function extractYouTubeVideoId(value) {
  const raw = cleanText(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      return cleanText(url.pathname.split("/").filter(Boolean)[0]);
    }
    if (host.endsWith("youtube.com")) {
      if (url.pathname === "/watch") {
        return cleanText(url.searchParams.get("v"));
      }
      const segments = url.pathname.split("/").filter(Boolean);
      const marker = segments[0];
      if (marker === "embed" || marker === "shorts" || marker === "live") {
        return cleanText(segments[1]);
      }
    }
  } catch {
    const match = raw.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([a-zA-Z0-9_-]{6,})/
    );
    if (match?.[1]) return cleanText(match[1]);
  }

  return "";
}

export function isYouTubeUrl(value) {
  return Boolean(extractYouTubeVideoId(value));
}
