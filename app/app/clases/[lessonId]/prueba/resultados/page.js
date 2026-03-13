import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RestartLessonQuizButton from "@/components/restart-lesson-quiz-button";
import { splitClozeSentenceSegments, tokenizeClozeSentence } from "@/lib/cloze-blanks";
import { toRichTextHtml } from "@/lib/rich-text";
import { getLimaTodayISO } from "@/lib/commissions";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import {
  LESSON_QUIZ_MAX_RESTARTS,
  LESSON_QUIZ_MAX_TOTAL_ATTEMPTS,
  LESSON_QUIZ_STATUS,
  canShowCorrectionDetails,
  formatDurationSeconds,
  getUsedQuizAttempts,
  isMissingLessonQuizAttemptScoreColumnError,
  isMissingLessonQuizRestartColumnError,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
} from "@/lib/lesson-quiz";
import { loadLessonQuizAssignments, parseLessonMarker } from "@/lib/lesson-quiz-assignments";
import { restartLessonQuizAttempt } from "../actions";

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

function StatusMark({ isCorrect }) {
  if (isCorrect) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center text-success"
        aria-label="Correcto"
        title="Correcto"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12l4 4 10-10" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center text-danger"
      aria-label="Incorrecto"
      title="Incorrecto"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </span>
  );
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stripRichTextTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ");
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (match?.[1] && match?.[2]) return `${match[1]}-${match[2]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function buildMonthDeadlineDate(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return "";
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
}

async function resolveQuizDeadlineContext(supabase, lesson, profile = null) {
  const marker = parseLessonMarker(lesson?.description);
  let monthKey = "";
  let commissionId = "";

  if (marker?.kind === "commission" && marker?.containerId) {
    const { data: session } = await supabase
      .from("course_sessions")
      .select("id, commission_id, cycle_month, session_date")
      .eq("id", marker.containerId)
      .maybeSingle();

    monthKey =
      normalizeMonthKey(session?.cycle_month) ||
      normalizeMonthKey(session?.session_date);
    commissionId = String(session?.commission_id || "").trim();
  }

  if (!monthKey && commissionId) {
    const { data: commission } = await supabase
      .from("course_commissions")
      .select("id, start_month, start_date")
      .eq("id", commissionId)
      .maybeSingle();
    monthKey =
      normalizeMonthKey(commission?.start_month) ||
      normalizeMonthKey(commission?.start_date);
  }

  if (!monthKey) {
    monthKey =
      normalizeMonthKey(profile?.commission?.start_month) ||
      normalizeMonthKey(profile?.commission?.start_date);
  }

  if (!monthKey) {
    return {
      deadline_at: null,
      deadlinePassed: false,
    };
  }

  const deadlineDate = buildMonthDeadlineDate(monthKey);
  if (!deadlineDate) {
    return {
      deadline_at: null,
      deadlinePassed: false,
    };
  }

  const deadlineAt = `${deadlineDate}T23:59:59-05:00`;
  const deadlinePassed = getLimaTodayISO() > deadlineDate;
  return {
    deadline_at: deadlineAt,
    deadlinePassed,
  };
}

function resolveCorrectionStateFromEntry(entry) {
  const clozeReview = entry?.clozeReview || null;
  const userResponseRows = normalizeArray(entry?.userResponseRows);

  if (clozeReview) {
    const keys = normalizeArray(clozeReview?.orderedKeys);
    const total = keys.length;
    const correctCount = keys.reduce((count, key) => {
      const row = clozeReview.reviewByKey?.get(String(key || "").toLowerCase());
      return count + (row?.isCorrect ? 1 : 0);
    }, 0);
    return {
      isFullyCorrect: total > 0 && correctCount === total,
      isPartiallyIncorrect: correctCount > 0 && correctCount < total,
      isIncorrect: total > 0 && correctCount === 0,
    };
  }

  if (userResponseRows.length) {
    const flags = userResponseRows.map((row) => Boolean(row?.isCorrect));
    const total = flags.length;
    const correctCount = flags.filter(Boolean).length;
    return {
      isFullyCorrect: total > 0 && correctCount === total,
      isPartiallyIncorrect: correctCount > 0 && correctCount < total,
      isIncorrect: total > 0 && correctCount === 0,
    };
  }

  return {
    isFullyCorrect: Boolean(entry?.isPassed),
    isPartiallyIncorrect: false,
    isIncorrect: !Boolean(entry?.isPassed),
  };
}

function round2(value) {
  return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

const EXERCISE_TYPE_LABELS = {
  scramble: "Scrambled Sentence",
  audio_match: "Listening Exercise",
  reading_exercise: "Reading Exercise",
  image_match: "Image Match",
  pairs: "Pairs",
  cloze: "Fill in the blanks",
};

const WRITTEN_ANSWER_MODES = {
  PLAIN_INPUT: "plain_input",
  BLANK_INPUT: "blank_input",
};

function normalizeWrittenAnswerMode(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return raw === WRITTEN_ANSWER_MODES.BLANK_INPUT
    ? WRITTEN_ANSWER_MODES.BLANK_INPUT
    : WRITTEN_ANSWER_MODES.PLAIN_INPUT;
}

function normalizeExerciseTypeLabel(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return EXERCISE_TYPE_LABELS[normalized] || "Ejercicio";
}

function renderRichTextFragments(text, keyPrefix = "rich") {
  const html = toRichTextHtml(text);
  if (!html) return null;
  return <span key={`${keyPrefix}-html`} dangerouslySetInnerHTML={{ __html: html }} />;
}

function getWrittenExampleAnswer(question = {}) {
  const explicitExample = String(question?.example_answer || question?.exampleAnswer || "").trim();
  if (explicitExample) return explicitExample;
  const accepted = normalizeArray(question?.accepted_answers);
  const firstAccepted = String(accepted[0] || "").trim();
  return firstAccepted || "";
}

function createQuestionSourceResolver(contentQuestions = []) {
  const questions = normalizeArray(contentQuestions).map((question) => normalizeObject(question));
  const byId = new Map();
  questions.forEach((question, index) => {
    const questionId = String(question?.id || `q_${index + 1}`).trim();
    if (!questionId) return;
    const bucket = byId.get(questionId) || [];
    bucket.push(question);
    byId.set(questionId, bucket);
  });

  const usageById = new Map();
  return function resolveQuestion(questionId, index) {
    const fallbackQuestion = normalizeObject(questions[index]);
    const fallbackId = String(fallbackQuestion?.id || `q_${index + 1}`).trim();
    const normalizedId = String(questionId || "").trim();

    if (!normalizedId) return fallbackQuestion;
    if (fallbackId && normalizedId === fallbackId) return fallbackQuestion;

    const bucket = byId.get(normalizedId);
    if (!bucket?.length) return fallbackQuestion;

    const currentUsage = usageById.get(normalizedId) || 0;
    usageById.set(normalizedId, currentUsage + 1);
    return normalizeObject(bucket[Math.min(currentUsage, bucket.length - 1)] || fallbackQuestion);
  };
}

function resolveImageMatchImageUrl(exercise) {
  const content = normalizeObject(exercise?.content_json);
  const direct = String(content.image_url || content.imageUrl || "").trim();
  if (direct) return direct;

  const options = normalizeArray(content.options);
  const correctIndex = Math.max(0, Math.min(options.length - 1, toInt(content.correct_index, 0)));
  const correctOption = normalizeObject(options[correctIndex]);
  const correctOptionImage = String(correctOption.image_url || correctOption.imageUrl || "").trim();
  if (correctOptionImage) return correctOptionImage;

  const fallbackOption = options.find((option) => {
    const optionObj = normalizeObject(option);
    return Boolean(String(optionObj.image_url || optionObj.imageUrl || "").trim());
  });
  const fallbackImage = String(normalizeObject(fallbackOption).image_url || normalizeObject(fallbackOption).imageUrl || "").trim();
  return fallbackImage;
}

function buildClozeBreakdownData(exercise, answerSnapshot) {
  const content = normalizeObject(exercise?.content_json);
  const rawBlanks = normalizeArray(content.blanks);
  const optionTextById = new Map(
    normalizeArray(content.options_pool).map((option) => [
      String(option?.id || "").trim().toLowerCase(),
      String(option?.text || "").trim(),
    ])
  );

  let blanks = rawBlanks.map((blank, idx) => {
    const key = String(blank?.key || blank?.id || `blank_${idx + 1}`).trim().toLowerCase();
    const correctOptionId = String(blank?.correct_option_id || blank?.correctOptionId || "").trim().toLowerCase();
    const correctText =
      optionTextById.get(correctOptionId) ||
      String(blank?.answer || blank?.correct || "").trim();
    return {
      key,
      correctText,
    };
  });

  if (!blanks.length) {
    const legacyOptions = normalizeArray(content.options).map((item) => String(item || "").trim());
    const correctIndex = Math.max(0, Math.min(legacyOptions.length - 1, toInt(content.correct_index, 0)));
    const correctText =
      legacyOptions[correctIndex] ||
      String(content.answer || content.correct || "").trim();
    if (correctText) {
      blanks = [{ key: "blank_1", correctText }];
    }
  }

  if (!blanks.length) return null;

  let sentence = String(content.sentence || exercise?.prompt || "").trim();
  if (!sentence) sentence = "Complete the sentence.";
  const tokenized = tokenizeClozeSentence(
    sentence,
    blanks.map((blank, index) => String(blank?.key || `blank_${index + 1}`).trim().toLowerCase())
  );
  sentence = tokenized.sentence;

  const snapshot = normalizeObject(answerSnapshot);
  const snapshotByKey = new Map(
    normalizeArray(snapshot.blanks).map((blank, idx) => {
      const key = String(blank?.key || `blank_${idx + 1}`).trim().toLowerCase();
      return [key, normalizeObject(blank)];
    })
  );
  const orderedKeys = tokenized.orderedKeys.map((key, index) => String(key || `blank_${index + 1}`).trim().toLowerCase());
  const reviewByKey = new Map(
    orderedKeys.map((key, index) => {
      const blank = blanks.find((entry) => entry.key === key) || blanks[index] || { key, correctText: "" };
      const saved = snapshotByKey.get(key) || null;
      const selectedText = String(saved?.selectedText || "").trim();
      const correctText = String(saved?.correctText || blank.correctText || "").trim();
      const isCorrect = Boolean(saved?.isCorrect);
      return [
        key,
        {
          key,
          selectedText,
          selectedOrFallback: selectedText || "[no answer]",
          correctText,
          isCorrect,
        },
      ];
    })
  );

  const explanations = normalizeObject(content.explanations);
  const explanationLines = orderedKeys
    .map((key, index) => String(explanations[key] || explanations[`blank_${index + 1}`] || "").trim())
    .filter(Boolean);

  return {
    segments: splitClozeSentenceSegments(sentence).segments,
    orderedKeys,
    reviewByKey,
    correctAnswers: orderedKeys
      .map((key) => String(reviewByKey.get(key)?.correctText || "").trim())
      .filter(Boolean),
    explanationLines,
  };
}

function buildCorrectAnswerLines(exercise) {
  const type = String(exercise?.type || "").trim().toLowerCase();
  const content = normalizeObject(exercise?.content_json);

  if (type === "scramble") {
    const words = normalizeArray(content.target_words);
    const order = normalizeArray(content.answer_order);
    const resolved = order.length === words.length
      ? order.map((index) => words[index]).filter(Boolean)
      : words.filter(Boolean);
    return resolved.length ? [resolved.join(" ")] : [];
  }

  if (type === "audio_match" || type === "reading_exercise") {
    const questions = normalizeArray(content.questions);
    if (questions.length) {
      return questions.map((question, index) => {
        const questionType = String(question?.type || "").trim().toLowerCase();
        const prompt = stripRichTextTags(question?.prompt || "") || `Pregunta ${index + 1}`;

        if (questionType === "written") {
          return `${prompt}: ${getWrittenExampleAnswer(question) || "-"}`;
        }

        if (questionType === "true_false") {
          return `${prompt}: ${question?.correct_boolean ? "True" : "False"}`;
        }

        const options = normalizeArray(question?.options).map((item) => String(item || "").trim());
        const correctIndex = Math.max(0, Math.min(options.length - 1, toInt(question?.correct_index, 0)));
        return `${prompt}: ${options[correctIndex] || `Option ${correctIndex + 1}`}`;
      });
    }

    const legacyCorrect = String(
      content.correct ||
      content.answer ||
      content.text_target ||
      ""
    ).trim();
    return legacyCorrect ? [legacyCorrect] : [];
  }

  if (type === "image_match") {
    const options = normalizeArray(content.options);
    const correctIndex = Math.max(0, Math.min(options.length - 1, toInt(content.correct_index, 0)));
    const option = options[correctIndex];
    const label = typeof option === "string"
      ? option
      : String(option?.label || option?.word_native || option?.word_target || option?.text || "").trim();
    return label ? [label] : [];
  }

  if (type === "pairs") {
    const pairs = normalizeArray(content.pairs)
      .map((pair) => {
        const left = String(pair?.left || pair?.native || "").trim();
        const right = String(pair?.right || pair?.target || "").trim();
        if (!left || !right) return "";
        return `${left} = ${right}`;
      })
      .filter(Boolean);
    return pairs;
  }

  if (type === "cloze") {
    const blanks = normalizeArray(content.blanks);
    const optionsPool = new Map(
      normalizeArray(content.options_pool).map((option) => [
        String(option?.id || "").trim().toLowerCase(),
        String(option?.text || "").trim(),
      ])
    );

    if (blanks.length) {
      return blanks.map((blank, index) => {
        const correctOptionId = String(blank?.correct_option_id || blank?.correctOptionId || "").trim().toLowerCase();
        const correctText =
          optionsPool.get(correctOptionId) ||
          String(blank?.answer || blank?.correct || "").trim() ||
          "-";
        return `Blank ${index + 1}: ${correctText}`;
      });
    }

    const legacyOptions = normalizeArray(content.options).map((item) => String(item || "").trim());
    if (legacyOptions.length) {
      const correctIndex = Math.max(0, Math.min(legacyOptions.length - 1, toInt(content.correct_index, 0)));
      return [legacyOptions[correctIndex] || "-"];
    }

    const answer = String(content.answer || content.correct || "").trim();
    return answer ? [answer] : [];
  }

  return [];
}

function buildExerciseExplanationLines(exercise, clozeBreakdown = null) {
  const type = String(exercise?.type || "").trim().toLowerCase();
  if (type === "audio_match" || type === "reading_exercise") {
    return [];
  }
  const content = normalizeObject(exercise?.content_json);
  const baseText = String(content.explanation || "").trim();
  if (/<\/?[a-z][\s\S]*>/i.test(baseText)) {
    return [baseText];
  }
  const baseLines = baseText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, ""));
  if (baseLines.length) {
    return baseLines;
  }
  const clozeLines = normalizeArray(clozeBreakdown?.explanationLines)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  return clozeLines;
}

function buildUserResponseRows(exercise, answerSnapshot, fallbackIsCorrect = false) {
  const snapshot = normalizeObject(answerSnapshot);
  const type = String(exercise?.type || "").trim().toLowerCase();

  if (type === "scramble" && snapshot.type === "scramble") {
    const selectedWords = normalizeArray(snapshot.selectedWords).map((word) => String(word || "").trim()).filter(Boolean);
    const correctWords = normalizeArray(snapshot.correctWords).map((word) => String(word || "").trim());
    const chips = selectedWords.map((word, index) => ({
      text: word,
      isCorrectPosition: normalizeText(word) === normalizeText(correctWords[index] || ""),
    }));
    return [{
      label: "Respuesta",
      value: selectedWords.length ? selectedWords.join(" ") : "[no answer]",
      isCorrect: Boolean(snapshot.isCorrect),
      scrambleWords: chips,
    }];
  }

  if (type === "pairs" && snapshot.type === "pairs") {
    const pairRows = normalizeArray(snapshot.pairs);
    if (!pairRows.length) {
      return [{ label: "Respuesta", value: "[no answer]", isCorrect: false }];
    }
    return pairRows.map((row, index) => ({
      label: `Par ${index + 1}`,
      value: row?.selectedRight ? `${row.left} = ${row.selectedRight}` : `${row.left} = [no answer]`,
      isCorrect: Boolean(row?.isCorrect),
    }));
  }

  if (type === "image_match" && snapshot.type === "image_match") {
    return [{
      label: "Respuesta",
      value: String(snapshot.selectedText || "").trim() || "[no answer]",
      isCorrect: Boolean(snapshot.isCorrect),
    }];
  }

  if ((type === "audio_match" || type === "reading_exercise") && snapshot.type === "question_set") {
    const contentQuestions = normalizeArray(normalizeObject(exercise?.content_json).questions);
    const resolveQuestionSource = createQuestionSourceResolver(contentQuestions);
    const questions = normalizeArray(snapshot.questions);
    if (!questions.length) {
      return [{ label: "Respuesta", value: "[no answer]", isCorrect: false }];
    }
    return questions.map((question, index) => {
      const questionId = String(question?.id || `q_${index + 1}`).trim();
      const sourceQuestion = resolveQuestionSource(questionId, index);
      const promptLabel = stripRichTextTags(question?.prompt || sourceQuestion?.prompt || "") || `Pregunta ${index + 1}`;
      const writtenAnswerMode = normalizeWrittenAnswerMode(
        question?.writtenAnswerMode ?? sourceQuestion?.written_answer_mode ?? sourceQuestion?.writtenAnswerMode
      );
      const promptSegments = writtenAnswerMode === WRITTEN_ANSWER_MODES.BLANK_INPUT
        ? splitClozeSentenceSegments(promptLabel, ["blank_1"]).segments
        : [];
      const rowLabel = writtenAnswerMode === WRITTEN_ANSWER_MODES.BLANK_INPUT
        ? `${index + 1}.`
        : `${index + 1}. ${promptLabel}`;
      return {
        label: rowLabel,
        value: String(question?.selectedText || "").trim() || "[no answer]",
        isCorrect: Boolean(question?.isCorrect),
        questionId,
        isBlankInput: writtenAnswerMode === WRITTEN_ANSWER_MODES.BLANK_INPUT,
        promptSegments,
        questionExplanation: String(
          sourceQuestion?.explanation ?? sourceQuestion?.explanation_richtext ?? ""
        ).trim(),
      };
    });
  }

  return [{ label: "Respuesta", value: "[no answer]", isCorrect: Boolean(fallbackIsCorrect) }];
}

function buildQuestionCorrectText(question = {}, fallbackIndex = 0) {
  const questionType = String(question?.type || "").trim().toLowerCase();
  if (questionType === "written") {
    return getWrittenExampleAnswer(question);
  }
  if (questionType === "true_false") {
    return question?.correct_boolean ? "True" : "False";
  }
  const options = normalizeArray(question?.options).map((item) => String(item || "").trim());
  const correctIndex = Math.max(0, Math.min(options.length - 1, toInt(question?.correct_index, fallbackIndex)));
  return options[correctIndex] || "";
}

function buildQuestionSetBreakdownRows(exercise, answerSnapshot) {
  const contentQuestions = normalizeArray(normalizeObject(exercise?.content_json).questions);
  const resolveQuestionSource = createQuestionSourceResolver(contentQuestions);

  const snapshot = normalizeObject(answerSnapshot);
  const snapshotQuestions = normalizeArray(snapshot.questions);
  const totalRows = Math.max(snapshotQuestions.length, contentQuestions.length);
  if (!totalRows) return [];

  return Array.from({ length: totalRows }).map((_, index) => {
    const snapshotQuestion = normalizeObject(snapshotQuestions[index]);
    const fallbackQuestion = normalizeObject(contentQuestions[index]);
    const questionId = String(
      snapshotQuestion.id || fallbackQuestion.id || `q_${index + 1}`
    ).trim();
    const sourceQuestion = resolveQuestionSource(questionId, index);
    const prompt = stripRichTextTags(snapshotQuestion.prompt || sourceQuestion.prompt || "") || `Pregunta ${index + 1}`;
    const selectedText = String(snapshotQuestion.selectedText || "").trim();
    const correctText = String(
      snapshotQuestion.correctText || buildQuestionCorrectText(sourceQuestion, index)
    ).trim();
    const writtenAnswerMode = normalizeWrittenAnswerMode(
      snapshotQuestion.writtenAnswerMode ??
      sourceQuestion.written_answer_mode ??
      sourceQuestion.writtenAnswerMode
    );
    const isBlankInput = String(sourceQuestion?.type || "").trim().toLowerCase() === "written" &&
      writtenAnswerMode === WRITTEN_ANSWER_MODES.BLANK_INPUT;
    const promptSegments = isBlankInput
      ? splitClozeSentenceSegments(prompt, ["blank_1"]).segments
      : [];
    const explanation = String(
      sourceQuestion.explanation ?? sourceQuestion.explanation_richtext ?? ""
    ).trim();
    const label = isBlankInput ? `${index + 1}.` : `${index + 1}. ${prompt}`;
    return {
      id: questionId || `q_${index + 1}`,
      label,
      selectedText: selectedText || "[no answer]",
      isCorrect: Boolean(snapshotQuestion.isCorrect),
      correctText: correctText || "-",
      isBlankInput,
      promptSegments,
      explanation,
    };
  });
}

function computeSnapshotPartialScore(answerSnapshot, weight) {
  const snapshot = normalizeObject(answerSnapshot);
  if (snapshot.type === "question_set") {
    const questions = normalizeArray(snapshot.questions);
    if (!questions.length) return 0;
    const correctCount = questions.filter((question) => Boolean(question?.isCorrect)).length;
    return round2((Number(weight) || 0) * (correctCount / questions.length));
  }
  return null;
}

function computeExerciseWeight(totalExercises, exerciseIndex) {
  const total = Math.max(1, Number(totalExercises) || 1);
  const index = Math.max(0, Number(exerciseIndex) || 0);
  const base = round2(100 / total);
  if (index < total - 1) return base;
  return round2(100 - (base * (total - 1)));
}

function computeExerciseWeightFromPoints(totalExercises, exerciseIndex, pointValues = []) {
  const total = Math.max(1, Number(totalExercises) || 1);
  const index = Math.max(0, Number(exerciseIndex) || 0);
  const values = normalizeArray(pointValues)
    .slice(0, total)
    .map((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    });
  const hasCustom = values.length === total && values.some((value) => value > 0);
  if (!hasCustom) return computeExerciseWeight(total, index);

  const sum = values.reduce((acc, value) => acc + value, 0);
  if (!Number.isFinite(sum) || sum <= 0) return computeExerciseWeight(total, index);
  return round2((values[index] / sum) * 100);
}

function isMissingUserProgressQuizColumnsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("wrong_attempts") ||
    message.includes("final_status") ||
    message.includes("score_awarded") ||
    message.includes("answered_at") ||
    message.includes("answer_snapshot")
  );
}

async function loadLessonProgressRows(supabase, userId, lessonId, exerciseIds = []) {
  const ids = Array.from(
    new Set((exerciseIds || []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (!ids.length) return [];

  async function runProgressQuery(scope = "lesson") {
    let query = supabase
      .from("user_progress")
      .select("exercise_id, is_correct, attempts, wrong_attempts, final_status, score_awarded, answered_at, answer_snapshot")
      .eq("user_id", userId)
      .in("exercise_id", ids);

    if (scope === "lesson") {
      query = query.eq("lesson_id", lessonId);
    } else if (scope === "legacy") {
      query = query.is("lesson_id", null);
    }

    let { data, error } = await query;

    if (error && isMissingUserProgressQuizColumnsError(error)) {
      let fallbackQuery = supabase
        .from("user_progress")
        .select("exercise_id, is_correct, attempts, last_practiced")
        .eq("user_id", userId)
        .in("exercise_id", ids);

      if (scope === "lesson") {
        fallbackQuery = fallbackQuery.eq("lesson_id", lessonId);
      } else if (scope === "legacy") {
        fallbackQuery = fallbackQuery.is("lesson_id", null);
      }

      ({ data, error } = await fallbackQuery);
    }

    return {
      data: data || [],
      error,
    };
  }

  const scoped = await runProgressQuery("lesson");
  if (scoped.error) {
    const noScope = await runProgressQuery("any");
    return noScope.error ? [] : noScope.data;
  }
  if (scoped.data.length) {
    return scoped.data;
  }

  const legacy = await runProgressQuery("legacy");
  return legacy.error ? scoped.data : legacy.data;
}

export const metadata = {
  title: "Resultados de test | Aula Virtual",
};

export default async function LessonQuizResultsPage({ params: paramsPromise, searchParams: searchParamsPromise }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const lessonId = String(params?.lessonId || "").trim();
  if (!lessonId) notFound();

  const { supabase, user, role } = await getRequestUserContext();
  if (!user) redirect("/login");
  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, commission_id, commission:course_commissions(id, start_month, start_date)")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.id) {
    redirect("/app/matricula?locked=1");
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, level, unit_id, ordering, description")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson?.id) notFound();

  const quiz = await loadLessonQuizAssignments(supabase, lesson);
  const published = Array.isArray(quiz?.exercises) ? quiz.exercises : [];
  const totalExercises = published.length;
  const fallbackNumber = Math.max(1, toInt(lesson?.ordering, 1));
  const testTitle = String(quiz?.title || lesson?.title || "").trim() || "Test de clase";
  const testNumber = Math.max(1, toInt(quiz?.testNumber, fallbackNumber));
  const exercisePointValues = published.map((exercise) => {
    const parsed = Number(exercise?.content_json?.point_value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });

  let attemptRow = null;
  let attemptError = null;
  ({
    data: attemptRow,
    error: attemptError,
  } = await supabase
    .from("lesson_quiz_attempts")
    .select(
      "attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, attempt_score_percent, restart_count, duration_seconds, completed_at, updated_at"
    )
    .eq("user_id", profile.id)
    .eq("lesson_id", lesson.id)
    .maybeSingle());

  if (
    attemptError &&
    (isMissingLessonQuizRestartColumnError(attemptError) || isMissingLessonQuizAttemptScoreColumnError(attemptError))
  ) {
    const fallback = await supabase
      .from("lesson_quiz_attempts")
      .select(
        "attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, duration_seconds, completed_at, updated_at"
      )
      .eq("user_id", profile.id)
      .eq("lesson_id", lesson.id)
      .maybeSingle();
    attemptError = fallback.error;
    attemptRow = fallback.data
      ? {
          ...fallback.data,
          restart_count: 0,
          attempt_score_percent: fallback.data?.score_percent ?? null,
        }
      : null;
  }

  if (attemptError) {
    if (isMissingLessonQuizTableError(attemptError)) {
      redirect(`/app/clases/${lesson.id}/prueba?tracking=missing`);
    }
    throw new Error(attemptError.message || "No se pudo cargar resultados de la prueba.");
  }

  const attempt = normalizeAttemptRow(attemptRow, totalExercises);
  if (attempt.attempt_status !== LESSON_QUIZ_STATUS.COMPLETED) {
    redirect(`/app/clases/${lesson.id}/prueba`);
  }

  const exerciseIds = published.map((exercise) => exercise.id);
  const progressRows = await loadLessonProgressRows(supabase, profile.id, lesson.id, exerciseIds);

  const progressByExercise = new Map(
    normalizeArray(progressRows).map((row) => [String(row.exercise_id || "").trim(), row])
  );
  const durationLabel = formatDurationSeconds(attempt.duration_seconds);
  const scoreValue = attempt.attempt_score_percent != null ? round2(attempt.attempt_score_percent) : null;
  const bestScoreValue = attempt.score_percent != null ? round2(attempt.score_percent) : scoreValue;
  const repeatCount = Math.max(0, toInt(attempt.restart_count, 0));
  const attemptsUsed = getUsedQuizAttempts({
    status: attempt.attempt_status,
    restartCount: repeatCount,
    completedCount: attempt.completed_count,
  });
  const remainingAttempts = Math.max(0, LESSON_QUIZ_MAX_TOTAL_ATTEMPTS - attemptsUsed);
  const remainingRestarts = Math.max(0, LESSON_QUIZ_MAX_RESTARTS - repeatCount);
  const deadlineContext = await resolveQuizDeadlineContext(supabase, lesson, profile);
  const canRepeat = remainingRestarts > 0;
  const repeatLimitWarning = searchParams?.repeat_limit === "1";
  const detailEntries = [];

  published.forEach((exercise, idx) => {
    const exerciseId = String(exercise?.id || "").trim();
    const progress = progressByExercise.get(exerciseId) || null;
    const hasResult = progress != null;
    const exerciseType = String(exercise?.type || "").trim().toLowerCase();
    const typeLabel = normalizeExerciseTypeLabel(exercise.type);
    const weight = computeExerciseWeightFromPoints(totalExercises, idx, exercisePointValues);
    const finalStatus = hasResult
      ? String(progress.final_status || (progress.is_correct ? "passed" : "failed")).toLowerCase()
      : null;
    const fallbackPartialScore = hasResult ? computeSnapshotPartialScore(progress?.answer_snapshot, weight) : null;
    const awarded = hasResult
      ? round2(
          progress.score_awarded != null
            ? progress.score_awarded
            : fallbackPartialScore != null
              ? fallbackPartialScore
              : finalStatus === "passed"
                ? weight
                : 0
        )
      : null;
    const isPassed = finalStatus === "passed";

    if (exerciseType === "reading_exercise" || exerciseType === "audio_match") {
      const questionRows = buildQuestionSetBreakdownRows(exercise, progress?.answer_snapshot);
      if (questionRows.length) {
        const baseQuestionWeight = round2(weight / questionRows.length);
        questionRows.forEach((questionRow, questionIndex) => {
          const questionWeight = questionIndex < questionRows.length - 1
            ? baseQuestionWeight
            : round2(weight - (baseQuestionWeight * (questionRows.length - 1)));
          detailEntries.push({
            key: `exercise-${idx}-${exerciseId || "item"}-${exerciseType}-q-${questionIndex}-${questionRow.id || "q"}`,
            kind: "question_set_item",
            hasResult,
            typeLabel,
            weight: questionWeight,
            awarded: questionRow.isCorrect ? questionWeight : 0,
            isPassed: questionRow.isCorrect,
            userResponseRows: [{
              label: questionRow.label,
              value: questionRow.selectedText,
              isCorrect: questionRow.isCorrect,
              isBlankInput: questionRow.isBlankInput,
              promptSegments: questionRow.promptSegments,
            }],
            answerLines: [questionRow.correctText],
            explanationLines: questionRow.explanation ? [questionRow.explanation] : [],
          });
        });
        return;
      }
    }

    const clozeReview = exerciseType === "cloze"
      ? buildClozeBreakdownData(exercise, progress?.answer_snapshot)
      : null;
    const answerLines = exerciseType === "cloze"
      ? normalizeArray(clozeReview?.correctAnswers)
      : buildCorrectAnswerLines(exercise);
    const explanationLines = buildExerciseExplanationLines(exercise, clozeReview);
    const userResponseRows = exerciseType === "cloze"
      ? []
      : buildUserResponseRows(exercise, progress?.answer_snapshot, isPassed);
    const questionExplanationRows =
      exerciseType === "audio_match" || exerciseType === "reading_exercise"
        ? userResponseRows
          .filter((row) => !row.isCorrect)
          .map((row, rowIndex) => ({
            key: row.questionId || `${exerciseId}-qexp-${rowIndex}`,
            label: row.label,
            text: String(row.questionExplanation || "").trim(),
          }))
          .filter((row) => row.text)
        : [];

    detailEntries.push({
      key: `exercise-${idx}-${exerciseId || "item"}`,
      kind: "exercise",
      hasResult,
      typeLabel,
      weight,
      awarded,
      isPassed,
      clozeReview,
      userResponseRows,
      answerLines,
      explanationLines,
      questionExplanationRows,
      imageUrl: exerciseType === "image_match" ? resolveImageMatchImageUrl(exercise) : "",
    });
  });

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-12 left-4 h-64 w-64 rounded-full bg-primary/18 blur-[120px]" />
        <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-accent/12 blur-[140px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Link
              href={`/app/clases/${lesson.id}/prueba`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              <ArrowLeftIcon />
              Volver
            </Link>
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">{`Test ${testNumber} - ${testTitle}`}</h1>
              <p className="text-sm text-muted">Resultados finales del test.</p>
            </div>
          </div>
          {lesson.level ? (
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
              {lesson.level}
            </span>
          ) : null}
        </header>
        {repeatLimitWarning ? (
          <div className="rounded-2xl border border-danger/45 bg-danger/12 px-4 py-3 text-sm text-danger">
            Alcanzaste el maximo de {LESSON_QUIZ_MAX_TOTAL_ATTEMPTS} intentos para este test.
          </div>
        ) : null}

        <article className="rounded-[2rem] border border-success/30 bg-surface p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/25 text-success">
              <CheckIcon />
            </span>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Completado</p>
              <h2 className="text-2xl font-black">Test completado</h2>
              <p className="text-sm text-muted">
                {attempt.completed_count} de {totalExercises} ejercicios finalizados.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {scoreValue != null ? (
              <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Puntaje del intento</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{scoreValue}/100</p>
              </div>
            ) : null}
            {bestScoreValue != null && bestScoreValue !== scoreValue ? (
              <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Mejor puntaje</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{bestScoreValue}/100</p>
              </div>
            ) : null}
            {durationLabel ? (
              <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Tiempo</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{durationLabel}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/app/clases/${lesson.id}/prueba`}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-surface px-5 py-3 text-base font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver al test
            </Link>
            <RestartLessonQuizButton
              action={restartLessonQuizAttempt}
              lessonId={lesson.id}
              canRepeat={canRepeat}
              remainingAttempts={remainingAttempts}
              attemptsUsed={attemptsUsed}
              maxAttempts={LESSON_QUIZ_MAX_TOTAL_ATTEMPTS}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Intentos usados: {attemptsUsed}/{LESSON_QUIZ_MAX_TOTAL_ATTEMPTS}
          </p>
        </article>

        <section className="rounded-3xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted">Detalle de ejercicios</h3>
          <p className="mt-1 text-sm text-muted">
            Revisa lo que respondiste, identifica en que fallaste y compara con las respuestas correctas.
          </p>
          <div className="mt-4 space-y-3">
            {detailEntries.map((entry, idx) => {
              const hasResult = Boolean(entry?.hasResult);
              const isPassed = Boolean(entry?.isPassed);
              const awarded = entry?.awarded;
              const weight = entry?.weight;
              const typeLabel = String(entry?.typeLabel || "Ejercicio");
              const exerciseType = String(entry?.kind === "exercise" && entry?.clozeReview ? "cloze" : "").trim().toLowerCase();
              const clozeReview = entry?.kind === "exercise" ? entry?.clozeReview || null : null;
              const answerLines = normalizeArray(entry?.answerLines);
              const explanationLines = normalizeArray(entry?.explanationLines);
              const userResponseRows = normalizeArray(entry?.userResponseRows);
              const questionExplanationRows = normalizeArray(entry?.questionExplanationRows);
              const imageUrl = String(entry?.imageUrl || "").trim();
              const correctionState = resolveCorrectionStateFromEntry({
                ...entry,
                userResponseRows,
                clozeReview,
              });
              const showCorrectionDetails = canShowCorrectionDetails({
                ...correctionState,
                attemptsRemaining: remainingAttempts,
                deadlinePassed: Boolean(deadlineContext?.deadlinePassed),
              });

              return (
                <article
                  key={`${entry.key}-${idx}`}
                  className={`rounded-2xl border p-4 sm:p-5 ${
                    hasResult
                      ? isPassed
                        ? "border-success/35 bg-success/5"
                        : "border-danger/35 bg-danger/5"
                      : "border-border bg-surface-2"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Ejercicio {idx + 1}
                        </span>
                        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">
                          {typeLabel}
                        </span>
                      </div>
                      <p className="text-sm text-muted">
                        {hasResult ? "Tu respuesta se muestra tal cual la enviaste." : "No se encontro respuesta guardada para este ejercicio."}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
                        {awarded != null ? `${awarded}/${weight}` : `0/${weight}`}
                      </span>
                      {hasResult ? (
                        <StatusMark isCorrect={isPassed} />
                      ) : (
                        <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
                          Sin data
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {imageUrl ? (
                      <div className="inline-flex max-w-full overflow-hidden rounded-lg border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt="Imagen del ejercicio"
                          className="block h-auto max-h-40 w-auto max-w-full object-left object-contain"
                        />
                      </div>
                    ) : null}
                    {exerciseType === "cloze" && clozeReview ? (
                      <div className="text-base font-semibold text-foreground whitespace-pre-wrap leading-8 sm:text-lg">
                        {clozeReview.segments.map((segment, segmentIndex) => {
                          if (segment.kind !== "blank") {
                            return <span key={`${entry.key}-segment-text-${segmentIndex}`}>{segment.value}</span>;
                          }
                          const key = String(segment.key || "").toLowerCase();
                          const row = clozeReview.reviewByKey.get(key) || {
                            selectedOrFallback: "[no answer]",
                            isCorrect: false,
                          };
                          return (
                            <span key={`${entry.key}-segment-blank-${segmentIndex}`} className="mx-1 my-1 inline-flex items-center gap-1 align-middle">
                              <span
                                className={`inline-flex min-h-9 min-w-24 items-center justify-center border px-2 py-1 text-xs font-semibold ${
                                  row.isCorrect
                                    ? "border-success/45 bg-success/10 text-success"
                                    : "border-danger/45 bg-danger/10 text-danger"
                                }`}
                              >
                                {row.selectedOrFallback}
                              </span>
                              <StatusMark isCorrect={row.isCorrect} />
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {userResponseRows.map((row, rowIndex) => (
                          row.isBlankInput ? (
                            <div key={`${entry.key}-user-row-${rowIndex}`} className="flex flex-wrap items-start gap-2 text-base text-foreground sm:text-lg">
                              <span className="font-semibold text-muted">{row.label}</span>
                              <span className="whitespace-pre-wrap leading-8">
                                {normalizeArray(row.promptSegments).map((segment, segmentIndex) => (
                                  segment.kind === "blank" ? (
                                    <span
                                      key={`${entry.key}-blank-segment-${rowIndex}-${segmentIndex}`}
                                      className={`mx-1 inline-flex min-h-9 min-w-24 items-center justify-center border px-2 py-1 text-xs font-semibold align-middle ${
                                        row.isCorrect
                                          ? "border-success/45 bg-success/10 text-success"
                                          : "border-danger/45 bg-danger/10 text-danger"
                                      }`}
                                    >
                                      {row.value || "[no answer]"}
                                    </span>
                                  ) : (
                                    <span key={`${entry.key}-text-segment-${rowIndex}-${segmentIndex}`}>{segment.value}</span>
                                  )
                                ))}
                              </span>
                              <StatusMark isCorrect={row.isCorrect} />
                            </div>
                          ) : Array.isArray(row.scrambleWords) && row.scrambleWords.length ? (
                            <div key={`${entry.key}-user-row-${rowIndex}`} className="flex flex-wrap items-center gap-2 text-base text-foreground sm:text-lg">
                              <span className="font-semibold text-muted">{row.label}:</span>
                              <span className="flex flex-wrap items-center gap-1.5">
                                {row.scrambleWords.map((word, wordIndex) => (
                                  <span
                                    key={`${entry.key}-scramble-word-${rowIndex}-${wordIndex}`}
                                    className={`inline-flex min-h-8 items-center justify-center border px-2 py-1 text-sm font-semibold ${
                                      word.isCorrectPosition
                                        ? "border-success/45 bg-success/10 text-success"
                                        : "border-danger/45 bg-danger/10 text-danger"
                                    }`}
                                  >
                                    {word.text}
                                  </span>
                                ))}
                              </span>
                              <StatusMark isCorrect={row.isCorrect} />
                            </div>
                          ) : (
                            <p key={`${entry.key}-user-row-${rowIndex}`} className="flex flex-wrap items-center gap-2 text-base text-foreground sm:text-lg">
                              <span className="font-semibold text-muted">{row.label}:</span>
                              <span>{row.value || "[no answer]"}</span>
                              <StatusMark isCorrect={row.isCorrect} />
                            </p>
                          )
                        ))}
                      </div>
                    )}
                  </div>

                  {showCorrectionDetails && (answerLines.length || explanationLines.length || questionExplanationRows.length) ? (
                    <div className="mt-4 rounded-none border border-border bg-surface px-3 py-3">
                      {showCorrectionDetails ? (
                        <p className="text-xs font-semibold text-muted">
                          <span className="uppercase tracking-wide">Correct answer(s): </span>
                          <span className="text-foreground">{answerLines.length ? answerLines.join(" / ") : "-"}</span>
                        </p>
                      ) : null}
                      {explanationLines.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-foreground">
                          {explanationLines.map((line, lineIndex) => (
                            <li key={`${entry.key}-explanation-${lineIndex}`}>
                              {renderRichTextFragments(line, `${entry.key}-explanation-${lineIndex}`)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {questionExplanationRows.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-foreground">
                          {questionExplanationRows.map((row) => (
                            <li key={`${entry.key}-question-explanation-${row.key}`}>
                              <span className="font-semibold text-muted">{row.label}: </span>
                              {renderRichTextFragments(row.text, `${entry.key}-question-explanation-${row.key}`)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!detailEntries.length ? (
              <p className="text-sm text-muted">Test completado.</p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
