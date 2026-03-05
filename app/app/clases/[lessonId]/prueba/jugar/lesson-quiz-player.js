"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ListeningPlaybackControl from "@/components/listening-playback-control";
import {
  buildListeningQuestionsFromContent,
  getListeningEndTime,
  getListeningMaxPlays,
  getListeningPrompt,
  getListeningStartTime,
  LISTENING_QUESTION_TYPES,
  summarizeListeningQuestionResults,
} from "@/lib/listening-exercise";
import { splitClozeSentenceSegments, tokenizeClozeSentence } from "@/lib/cloze-blanks";
import { submitLessonQuizStep } from "../actions";

const TYPE_LABELS = {
  scramble: "Scrambled Sentence",
  audio_match: "Listening Exercise",
  reading_exercise: "Reading Exercise",
  image_match: "Image Match",
  pairs: "Pairs",
  cloze: "Fill in the blanks",
};

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ");
}

function round2(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function shuffleList(items) {
  const next = [...items];
  for (let idx = next.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  }
  return next;
}

function computeExerciseWeight(totalExercises, exerciseIndex) {
  const total = Math.max(1, Number(totalExercises) || 1);
  const index = Math.max(0, Number(exerciseIndex) || 0);
  const base = round2(100 / total);
  if (index < total - 1) return base;
  return round2(100 - (base * (total - 1)));
}

function computeExerciseWeightFromPoints(totalExercises, exerciseIndex, exercisePointValues = []) {
  const total = Math.max(1, Number(totalExercises) || 1);
  const index = Math.max(0, Number(exerciseIndex) || 0);
  const points = normalizeArray(exercisePointValues)
    .slice(0, total)
    .map((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    });

  const hasCustomPoints = points.length === total && points.some((value) => value > 0);
  if (!hasCustomPoints) {
    return computeExerciseWeight(total, index);
  }

  const totalPoints = points.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalPoints) || totalPoints <= 0) {
    return computeExerciseWeight(total, index);
  }

  const raw = (points[index] / totalPoints) * 100;
  return round2(raw);
}

function computeExerciseScore(weight, finalStatus, itemStats = null) {
  let ratio = finalStatus === "passed" ? 1 : 0;
  const correctItems = Number(itemStats?.correctItems);
  const totalItems = Number(itemStats?.totalItems);
  if (Number.isFinite(correctItems) && Number.isFinite(totalItems) && totalItems > 0) {
    ratio = Math.min(1, Math.max(0, correctItems / totalItems));
  }
  if (ratio <= 0) return 0;
  return round2((Number(weight) || 0) * ratio);
}

function isArrayEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let idx = 0; idx < a.length; idx += 1) {
    if (normalizeText(a[idx]) !== normalizeText(b[idx])) return false;
  }
  return true;
}

function buildShuffledScrambleWords(words = [], answerWords = []) {
  const source = normalizeArray(words).map((word) => String(word || "").trim()).filter(Boolean);
  if (source.length <= 1) return source;

  const expected = normalizeArray(answerWords).map((word) => String(word || "").trim()).filter(Boolean);
  let shuffled = [...source];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    shuffled = shuffleList(source);
    if (!isArrayEqual(shuffled, expected)) {
      return shuffled;
    }
  }
  return shuffled;
}

function buildClozeAnswerSnapshot(data = {}, selections = {}) {
  const blanks = normalizeArray(data.blanks);
  const optionById = new Map(
    normalizeArray(data.optionsPool).map((option) => [
      String(option?.id || "").trim().toLowerCase(),
      String(option?.text || "").trim(),
    ])
  );

  return {
    type: "cloze",
    sentence: String(data.sentence || "").trim(),
    blanks: blanks.map((blank, idx) => {
      const key = String(blank?.key || `blank_${idx + 1}`).trim().toLowerCase();
      const selectedOptionId = String(selections[key] || "").trim().toLowerCase();
      const correctOptionId = String(blank?.correctOptionId || "").trim().toLowerCase();
      const selectedText = optionById.get(selectedOptionId) || "";
      const correctText = optionById.get(correctOptionId) || "";
      return {
        key,
        selectedOptionId,
        correctOptionId,
        selectedText,
        correctText,
        isCorrect: Boolean(correctOptionId && selectedOptionId && selectedOptionId === correctOptionId),
      };
    }),
  };
}

function buildScrambleAnswerSnapshot(data = {}, selectedWords = []) {
  const correctWords = normalizeArray(data.answerWords).map((word) => String(word || "").trim()).filter(Boolean);
  const candidateWords = normalizeArray(selectedWords).map((word) => String(word || "").trim()).filter(Boolean);
  return {
    type: "scramble",
    prompt: String(data.prompt || "").trim(),
    selectedWords: candidateWords,
    correctWords,
    isCorrect: correctWords.length > 0 && candidateWords.length === correctWords.length && isArrayEqual(candidateWords, correctWords),
  };
}

function buildPairsAnswerSnapshot(pairRows = [], pairAssignments = {}) {
  const rows = normalizeArray(pairRows);
  return {
    type: "pairs",
    pairs: rows.map((pair) => {
      const pairId = String(pair?.id || "").trim();
      const selectedId = String(pairAssignments?.[pairId] || "").trim();
      const selected = rows.find((current) => String(current?.id || "").trim() === selectedId) || null;
      return {
        id: pairId,
        left: String(pair?.left || "").trim(),
        selectedRight: String(selected?.right || "").trim(),
        correctRight: String(pair?.right || "").trim(),
        isCorrect: Boolean(pairId && selectedId && pairId === selectedId),
      };
    }),
  };
}

function buildImageMatchAnswerSnapshot(data = {}, selectedIndex = null) {
  const options = normalizeArray(data.options);
  const safeSelectedIndex = Number.isFinite(selectedIndex) ? Number(selectedIndex) : -1;
  const selectedOption = safeSelectedIndex >= 0 ? options[safeSelectedIndex] : null;
  const correctIndex = Number.isFinite(Number(data.correctIndex)) ? Number(data.correctIndex) : -1;
  const correctOption = correctIndex >= 0 ? options[correctIndex] : null;
  return {
    type: "image_match",
    selectedIndex: safeSelectedIndex >= 0 ? safeSelectedIndex : null,
    selectedText: String(selectedOption?.label || "").trim(),
    correctIndex: correctIndex >= 0 ? correctIndex : null,
    correctText: String(correctOption?.label || "").trim(),
    isCorrect: safeSelectedIndex >= 0 && safeSelectedIndex === correctIndex,
  };
}

function buildQuestionSetAnswerSnapshot(questions = [], answersById = {}, summary = null) {
  const safeQuestions = normalizeArray(questions);
  const safeAnswers = answersById && typeof answersById === "object" ? answersById : {};
  const summaryById = new Map(
    normalizeArray(summary?.results).map((entry) => [
      String(entry?.id || "").trim(),
      entry,
    ])
  );

  return {
    type: "question_set",
    questions: safeQuestions.map((question, index) => {
      const questionId = String(question?.id || `q_${index + 1}`).trim();
      const answerState = safeAnswers[questionId] || {};
      const questionType = String(question?.type || "").trim().toLowerCase();
      let selectedText = "";
      let correctText = "";

      if (questionType === LISTENING_QUESTION_TYPES.WRITTEN) {
        selectedText = String(answerState?.text || "").trim();
        correctText = normalizeArray(question?.accepted_answers)
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .join(" / ");
      } else if (questionType === LISTENING_QUESTION_TYPES.TRUE_FALSE) {
        selectedText = answerState?.value == null ? "" : (answerState.value ? "True" : "False");
        correctText = question?.correct_boolean ? "True" : "False";
      } else {
        const options = normalizeArray(question?.options).map((item) => String(item || "").trim());
        const selectedIndex = Number(answerState?.selected_index);
        const correctIndex = Number(question?.correct_index);
        selectedText = Number.isFinite(selectedIndex) && selectedIndex >= 0 ? (options[selectedIndex] || "") : "";
        correctText = Number.isFinite(correctIndex) && correctIndex >= 0 ? (options[correctIndex] || "") : "";
      }

      const summaryItem = summaryById.get(questionId) || null;
      return {
        id: questionId,
        prompt: String(question?.prompt || `Pregunta ${index + 1}`).trim(),
        selectedText,
        correctText,
        answered: Boolean(summaryItem?.answered),
        isCorrect: Boolean(summaryItem?.isCorrect),
      };
    }),
  };
}

function resolveExerciseData(exercise) {
  const content = exercise?.content_json || {};
  const type = String(exercise?.type || "").trim();
  const explanation = String(content.explanation || "").trim();

  if (type === "cloze") {
    let sentence = String(content.sentence || exercise?.prompt || "").trim();
    const optionsPool = [];
    const appendPoolOption = (text = "") => {
      const used = new Set(optionsPool.map((option) => option.id));
      let next = 1;
      while (used.has(`opt_${next}`)) next += 1;
      const optionId = `opt_${next}`;
      optionsPool.push({ id: optionId, text: String(text || "").trim() });
      return optionId;
    };
    const ensurePoolOption = (optionId, fallbackText = "") => {
      const rawOptionId = String(optionId || "").trim().toLowerCase();
      const safeId = rawOptionId
        ? (rawOptionId.startsWith("opt_") ? rawOptionId : `opt_${rawOptionId}`)
        : "";
      if (!safeId) return appendPoolOption(fallbackText);
      const existing = optionsPool.find((option) => option.id === safeId);
      if (existing) {
        if (!String(existing.text || "").trim() && String(fallbackText || "").trim()) {
          existing.text = String(fallbackText || "").trim();
        }
        return safeId;
      }
      optionsPool.push({ id: safeId, text: String(fallbackText || "").trim() });
      return safeId;
    };

    const rawPool = normalizeArray(content.options_pool || content.optionsPool);
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

    const rawBlanks = normalizeArray(content.blanks);
    const resolveCorrectOptionId = (source = {}, fallbackOptionIds = []) => {
      let correctOptionId = String(source.correct_option_id || source.correctOptionId || "").trim();
      if (correctOptionId) {
        return ensurePoolOption(correctOptionId, "");
      }

      const answerText = String(source.answer || source.correct || "").trim();
      if (answerText) {
        const byText = optionsPool.find(
          (option) => normalizeText(option.text) === normalizeText(answerText)
        );
        return byText?.id || appendPoolOption(answerText);
      }

      const correctIndex = Number.parseInt(
        String(source.correct_index ?? source.correctIndex ?? ""),
        10
      );
      if (Number.isFinite(correctIndex) && correctIndex >= 0 && correctIndex < fallbackOptionIds.length) {
        return fallbackOptionIds[correctIndex];
      }

      return "";
    };

    let blanks = rawBlanks.map((blank, idx) => {
      const source = blank && typeof blank === "object" ? blank : {};
      const key = String(source.id || source.key || `blank_${idx + 1}`).trim().toLowerCase();
      return {
        key,
        correctOptionId: resolveCorrectOptionId(source),
      };
    });

    if (!blanks.length) {
      const legacyOptionTexts = normalizeArray(content.options)
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const hasLegacyBlank =
        legacyOptionTexts.length > 0 ||
        content.answer != null ||
        content.correct != null ||
        content.correct_index != null ||
        content.correctIndex != null;

      if (hasLegacyBlank) {
        const optionIds = legacyOptionTexts.map((text) => appendPoolOption(text));
        blanks = [{
          key: "blank_1",
          correctOptionId: resolveCorrectOptionId(content, optionIds),
        }];
      }
    }

    if (!optionsPool.length) {
      appendPoolOption("");
    }

    if (!sentence) sentence = "I [Blank] a student.";
    const tokenized = tokenizeClozeSentence(
      sentence,
      blanks.map((blank, index) => String(blank?.key || `blank_${index + 1}`))
    );
    sentence = tokenized.sentence;

    const orderedKeys = tokenized.orderedKeys.map((key, index) => String(key || `blank_${index + 1}`).toLowerCase());
    const blankByKey = new Map(blanks.map((blank) => [blank.key, blank]));
    const orderedBlanks = orderedKeys.map((key, idx) => {
      const current = blankByKey.get(key) || {};
      let correctOptionId = String(current.correctOptionId || current.correct_option_id || "").trim();
      if (correctOptionId) {
        correctOptionId = ensurePoolOption(correctOptionId, "");
      }
      return {
        key,
        correctOptionId,
      };
    });

    const split = splitClozeSentenceSegments(
      sentence,
      orderedBlanks.map((blank, index) => String(blank?.key || `blank_${index + 1}`))
    );
    const segments = split.segments;
    return {
      type,
      explanation,
      sentence,
      segments,
      blanks: orderedBlanks,
      optionsPool,
    };
  }

  if (type === "scramble") {
    let answerWords = normalizeArray(content.answer).map((value) => String(value || "").trim()).filter(Boolean);
    const targetWords = normalizeArray(content.target_words).map((value) => String(value || "").trim()).filter(Boolean);
    const answerOrder = normalizeArray(content.answer_order).map((value) => Number(value));
    if (!answerWords.length && targetWords.length && answerOrder.length === targetWords.length) {
      answerWords = answerOrder.map((idx) => targetWords[idx]).filter(Boolean);
    }
    if (!answerWords.length && targetWords.length) answerWords = [...targetWords];

    let scrambledWords = normalizeArray(content.scrambled).map((value) => String(value || "").trim()).filter(Boolean);
    if (!scrambledWords.length && targetWords.length) {
      scrambledWords = buildShuffledScrambleWords(targetWords, answerWords);
    }
    if (!scrambledWords.length && answerWords.length) {
      scrambledWords = buildShuffledScrambleWords(answerWords, answerWords);
    }

    return {
      type,
      explanation,
      prompt: String(content.prompt_native || exercise?.prompt || "Ordena la oracion."),
      answerWords,
      scrambledWords,
    };
  }

  if (type === "pairs") {
    const rows = normalizeArray(content.pairs)
      .map((row, idx) => ({
        id: String(idx),
        left: String(row?.left || row?.native || "").trim(),
        right: String(row?.right || row?.target || "").trim(),
      }))
      .filter((row) => row.left && row.right);
    const shuffle = content.shuffle !== false;
    return { type, explanation, pairs: rows, shuffle };
  }

  if (type === "image_match") {
    const options = normalizeArray(content.options).map((option, idx) => {
      if (typeof option === "string") {
        return {
          id: String(idx),
          vocabId: "",
          label: String(option || "").trim(),
          imageUrl: "",
        };
      }
      return {
        id: String(idx),
        imageUrl: String(option?.image_url || "").trim(),
        vocabId: String(option?.vocab_id || "").trim(),
        label: String(
          option?.label || option?.word_native || option?.word_target || option?.text || option?.vocab_id || `Opcion ${idx + 1}`
        ).trim(),
      };
    });
    const correctByIndex = Math.max(0, Math.min(options.length - 1, Number(content.correct_index) || 0));
    const correctByVocab = String(content.correct_vocab_id || "").trim();
    const indexByVocab = correctByVocab ? options.findIndex((option) => option.vocabId === correctByVocab) : -1;
    const correctIndex = indexByVocab >= 0 ? indexByVocab : correctByIndex;
    const imageUrl = String(content.image_url || content.imageUrl || "").trim() || options[correctIndex]?.imageUrl || "";
    return {
      type,
      explanation,
      question: String(content.question_native || exercise?.prompt || "Que palabra corresponde a la imagen?"),
      imageUrl,
      options,
      correctIndex,
    };
  }

  if (type === "audio_match") {
    const questions = buildListeningQuestionsFromContent(content);
    return {
      type,
      explanation,
      prompt: getListeningPrompt(content) || String(exercise?.prompt || "Escucha y responde."),
      textTarget: String(content.text_target || "").trim(),
      audioUrl: String(content.audio_url || "").trim(),
      youtubeUrl: String(content.youtube_url || content.youtubeUrl || "").trim(),
      maxPlays: getListeningMaxPlays(content, 1),
      startTime: getListeningStartTime(content, 0),
      endTime: getListeningEndTime(content, null),
      questions,
    };
  }

  if (type === "reading_exercise") {
    const questions = buildListeningQuestionsFromContent(content);
    return {
      type,
      explanation,
      title: String(content.title || content.reading_title || "Reading Exercise").trim(),
      readingText: String(
        content.text ||
        content.reading_text ||
        content.readingText ||
        content.body ||
        content.passage ||
        ""
      ).trim(),
      imageUrl: String(content.image_url || content.imageUrl || "").trim(),
      questions,
    };
  }

  return {
    type: "cloze",
    explanation,
    sentence: String(content.sentence || exercise?.prompt || "Completa la frase."),
    options: normalizeArray(content.options).map((value) => String(value || "").trim()).filter(Boolean),
    correctAnswer: String(content.correct || content.answer || "").trim(),
  };
}

function ExerciseTypeHeading({ type }) {
  const label = TYPE_LABELS[String(type || "").trim()] || "Ejercicio";
  return (
    <p className="text-lg font-semibold text-foreground sm:text-xl">
      {label}
    </p>
  );
}

const LessonQuizPlayer = forwardRef(function LessonQuizPlayer({
  lessonId,
  currentIndex,
  totalExercises,
  exercise,
  exercisePointValues = [],
  showSubmitButton = true,
  showTypeHeading = true,
}, ref) {
  const data = useMemo(() => resolveExerciseData(exercise), [exercise]);
  const type = data.type;
  const listeningExerciseKey = String(exercise?.id || `${lessonId}-${currentIndex}`);
  const exerciseWeight = useMemo(
    () => computeExerciseWeightFromPoints(totalExercises, currentIndex, exercisePointValues),
    [totalExercises, currentIndex, exercisePointValues]
  );

  const [finalStatus, setFinalStatus] = useState(null);
  const [scoreAwarded, setScoreAwarded] = useState(0);
  const [resultSnapshot, setResultSnapshot] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [errorFlash, setErrorFlash] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [clozeSelections, setClozeSelections] = useState({});
  const [activeClozeBlank, setActiveClozeBlank] = useState(null);
  const [clozeDraggingOptionId, setClozeDraggingOptionId] = useState("");

  const [selectedScrambleIds, setSelectedScrambleIds] = useState([]);

  const [selectedLeftPair, setSelectedLeftPair] = useState(null);
  const [selectedRightPair, setSelectedRightPair] = useState(null);
  const [pairAssignments, setPairAssignments] = useState({});

  const [selectedImageIndex, setSelectedImageIndex] = useState(null);

  const [listeningAnswersByExercise, setListeningAnswersByExercise] = useState({});
  const [listeningPlaybackState, setListeningPlaybackState] = useState({
    isPlaying: false,
    playsUsed: 0,
    remainingPlays: getListeningMaxPlays(data, 1),
    canPlay: Boolean(data.audioUrl || data.youtubeUrl),
  });
  const listeningAnswers = useMemo(
    () => listeningAnswersByExercise[listeningExerciseKey] || {},
    [listeningAnswersByExercise, listeningExerciseKey]
  );

  const pairBoardRef = useRef(null);
  const exerciseRootRef = useRef(null);
  const leftPairRefs = useRef(new Map());
  const rightPairRefs = useRef(new Map());
  const suppressClozeClickRef = useRef(false);
  const clozeDragRef = useRef(null);
  const clozeDragRafRef = useRef(0);
  const [pairLinesTick, setPairLinesTick] = useState(0);
  const [pairLines, setPairLines] = useState([]);

  const scrambleChips = useMemo(
    () => normalizeArray(data.scrambledWords).map((word, idx) => ({ id: `word-${idx}`, word })),
    [data.scrambledWords]
  );
  const scrambleChipMap = useMemo(() => new Map(scrambleChips.map((chip) => [chip.id, chip.word])), [scrambleChips]);
  const selectedScrambleWords = useMemo(
    () => selectedScrambleIds.map((id) => scrambleChipMap.get(id)).filter(Boolean),
    [selectedScrambleIds, scrambleChipMap]
  );

  const pairRows = useMemo(() => normalizeArray(data.pairs), [data.pairs]);
  const leftPairCards = useMemo(() => {
    const items = pairRows.map((pair) => ({ pairId: pair.id, label: pair.left }));
    return data.shuffle ? shuffleList(items) : items;
  }, [pairRows, data.shuffle]);
  const rightPairCards = useMemo(() => {
    const items = pairRows.map((pair) => ({ pairId: pair.id, label: pair.right }));
    return data.shuffle ? shuffleList(items) : items;
  }, [pairRows, data.shuffle]);

  const answerSnapshotValue = useMemo(() => {
    if (!resultSnapshot) return "";
    try {
      return JSON.stringify(resultSnapshot);
    } catch {
      return "";
    }
  }, [resultSnapshot]);
  const resolvedActiveClozeBlank = useMemo(() => {
    const blankKeys = normalizeArray(data.blanks).map((blank, idx) =>
      String(blank?.key || `blank_${idx + 1}`).toLowerCase()
    );
    if (!blankKeys.length) return "";
    const selected = String(activeClozeBlank || "").toLowerCase();
    return blankKeys.includes(selected) ? selected : blankKeys[0];
  }, [activeClozeBlank, data.blanks]);

  const isResolved = finalStatus === "passed" || finalStatus === "failed";
  const isFailed = finalStatus === "failed";

  useEffect(() => {
    if (type !== "pairs") return undefined;
    const handleResize = () => setPairLinesTick((value) => value + 1);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [type]);

  useEffect(() => {
    if (type !== "pairs") return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const board = pairBoardRef.current;
      if (!board) {
        setPairLines([]);
        return;
      }
      const boardRect = board.getBoundingClientRect();

      function buildLine(leftPairId, rightPairId, color, dashed = false) {
        const leftNode = leftPairRefs.current.get(leftPairId);
        const rightNode = rightPairRefs.current.get(rightPairId);
        if (!leftNode || !rightNode) return null;
        const leftRect = leftNode.getBoundingClientRect();
        const rightRect = rightNode.getBoundingClientRect();
        return {
          key: `${leftPairId}-${rightPairId}-${color}-${dashed ? "dashed" : "solid"}`,
          x1: leftRect.right - boardRect.left,
          y1: leftRect.top + leftRect.height / 2 - boardRect.top,
          x2: rightRect.left - boardRect.left,
          y2: rightRect.top + rightRect.height / 2 - boardRect.top,
          color,
          dashed,
        };
      }

      const nextLines = [];
      Object.entries(pairAssignments).forEach(([leftPairId, rightPairId]) => {
        if (!leftPairId || !rightPairId) return;
        const color = isResolved ? "#16a34a" : "#2563eb";
        const line = buildLine(leftPairId, rightPairId, color, false);
        if (line) nextLines.push(line);
      });

      setPairLines(nextLines);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [type, pairAssignments, isResolved, pairLinesTick, leftPairCards, rightPairCards]);

  useEffect(() => () => {
    if (clozeDragRafRef.current) {
      window.cancelAnimationFrame(clozeDragRafRef.current);
      clozeDragRafRef.current = 0;
    }
  }, []);

  useEffect(() => {
    const root = exerciseRootRef.current;
    if (!root) return undefined;
    const handleSelectStart = (event) => handleExerciseSelectStart(event);
    root.addEventListener("selectstart", handleSelectStart);
    return () => {
      root.removeEventListener("selectstart", handleSelectStart);
    };
  }, []);

  function clearIncorrectFeedback() {
    if (feedback?.kind === "incorrect" || feedback?.kind === "incomplete") {
      setFeedback(null);
      setErrorFlash(false);
    }
  }

  function buildSubmissionPayload(status, awarded, snapshotValue = null) {
    const safeStatus = String(status || "").trim().toLowerCase();
    if (!safeStatus || !exercise?.id) return null;
    return {
      exerciseId: String(exercise.id || "").trim(),
      exerciseIndex: currentIndex,
      wrongAttempts: 0,
      finalStatus: safeStatus === "failed" ? "failed" : "passed",
      scoreAwarded: round2(Number(awarded) || 0),
      answerSnapshot:
        snapshotValue && typeof snapshotValue === "object" && !Array.isArray(snapshotValue)
          ? snapshotValue
          : null,
    };
  }

  function markPassed(itemStats = null, snapshotValue = null) {
    if (isResolved) return;
    const awarded = computeExerciseScore(exerciseWeight, "passed", itemStats);
    setFinalStatus("passed");
    setScoreAwarded(awarded);
    setFeedback({ kind: "correct", text: "Correcto!" });
    setErrorFlash(false);
    return buildSubmissionPayload("passed", awarded, snapshotValue);
  }

  function markFailed(options = {}, snapshotValue = null) {
    if (isResolved) return;
    const awarded = computeExerciseScore(exerciseWeight, "failed", options.itemStats);
    setFinalStatus("failed");
    setScoreAwarded(awarded);
    setFeedback({
      kind: "incorrect",
      text: options.message || (awarded > 0 ? `Incorrecto. Puntaje parcial: ${awarded}/${exerciseWeight}.` : "Incorrecto."),
    });
    setErrorFlash(false);
    return buildSubmissionPayload("failed", awarded, snapshotValue);
  }

  function getOrderedClozeBlankKeys() {
    return normalizeArray(data.blanks)
      .map((blank, idx) => String(blank?.key || `blank_${idx + 1}`).toLowerCase())
      .filter(Boolean);
  }

  function getNextClozeBlankKey(blankKeys, selections, currentKey) {
    if (!blankKeys.length) return "";
    const currentIndex = Math.max(0, blankKeys.indexOf(currentKey));
    const nextAfterCurrent = blankKeys.slice(currentIndex + 1).find((key) => !selections[key]);
    if (nextAfterCurrent) return nextAfterCurrent;
    const firstEmpty = blankKeys.find((key) => !selections[key]);
    if (firstEmpty) return firstEmpty;
    return currentKey || blankKeys[0] || "";
  }

  function assignClozeOption(blankKey, optionId) {
    if (type !== "cloze" || isResolved) return;
    const safeKey = String(blankKey || "").trim().toLowerCase();
    const safeOptionId = String(optionId || "").trim().toLowerCase();
    if (!safeKey) return;
    if (!safeOptionId) return;
    const blankKeys = getOrderedClozeBlankKeys();
    let nextActiveKey = safeKey;
    setClozeSelections((current) => {
      const next = { ...current };
      const sourceKey = Object.keys(next).find((key) => String(next[key] || "").toLowerCase() === safeOptionId);
      const targetOptionId = String(next[safeKey] || "").toLowerCase();

      if (sourceKey && sourceKey !== safeKey) {
        if (targetOptionId && targetOptionId !== safeOptionId) {
          next[sourceKey] = targetOptionId;
        } else {
          delete next[sourceKey];
        }
      }

      Object.keys(next).forEach((key) => {
        if (key === safeKey) return;
        if (sourceKey && key === sourceKey) return;
        if (String(next[key] || "").toLowerCase() === safeOptionId) {
          delete next[key];
        }
      });

      next[safeKey] = safeOptionId;
      nextActiveKey = getNextClozeBlankKey(blankKeys, next, safeKey);
      return next;
    });
    setActiveClozeBlank(nextActiveKey);
  }

  function clearClozeSelection(blankKey) {
    if (type !== "cloze" || isResolved) return;
    const safeKey = String(blankKey || "").trim().toLowerCase();
    if (!safeKey) return;
    clearIncorrectFeedback();
    setActiveClozeBlank(safeKey);
    setClozeSelections((current) => {
      if (!current[safeKey]) return current;
      const next = { ...current };
      delete next[safeKey];
      return next;
    });
  }

  function paintClozeDragFrame() {
    clozeDragRafRef.current = 0;
    const drag = clozeDragRef.current;
    if (!drag?.dragging || !drag?.node) return;

    const nextX = drag.pointerX - drag.offsetX;
    const nextY = drag.pointerY - drag.offsetY;
    drag.node.style.transform = `translate3d(${nextX - drag.originLeft}px, ${nextY - drag.originTop}px, 0)`;
  }

  function scheduleClozeDragPaint() {
    if (clozeDragRafRef.current) return;
    clozeDragRafRef.current = window.requestAnimationFrame(paintClozeDragFrame);
  }

  function finishClozeDrag(event) {
    const drag = clozeDragRef.current;
    if (!drag) return;

    window.removeEventListener("pointermove", drag.handleMove);
    window.removeEventListener("pointerup", drag.handleUp);
    window.removeEventListener("pointercancel", drag.handleUp);

    if (clozeDragRafRef.current) {
      window.cancelAnimationFrame(clozeDragRafRef.current);
      clozeDragRafRef.current = 0;
    }

    if (drag.node) {
      drag.node.style.position = "";
      drag.node.style.left = "";
      drag.node.style.top = "";
      drag.node.style.zIndex = "";
      drag.node.style.width = "";
      drag.node.style.pointerEvents = "";
      drag.node.style.transform = "";
      drag.node.style.willChange = "";
    }

    if (drag.dragging) {
      const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
      const blankNode = dropTarget?.closest?.("[data-cloze-blank-key]");
      const dropKey = String(blankNode?.getAttribute?.("data-cloze-blank-key") || "").trim().toLowerCase();
      if (dropKey) {
        assignClozeOption(dropKey, drag.optionId);
      }
    }

    clozeDragRef.current = null;
    setClozeDraggingOptionId("");
    window.setTimeout(() => {
      suppressClozeClickRef.current = false;
    }, 0);
  }

  function handleClozePointerDown(event, optionId) {
    if (type !== "cloze" || isResolved) return;
    if (event.button != null && event.button !== 0) return;

    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    const safeOptionId = String(optionId || "").trim().toLowerCase();
    const handleMove = (moveEvent) => {
      const drag = clozeDragRef.current;
      if (!drag) return;

      const deltaX = moveEvent.clientX - drag.startX;
      const deltaY = moveEvent.clientY - drag.startY;
      if (!drag.dragging && Math.abs(deltaX) <= 6 && Math.abs(deltaY) <= 6) {
        return;
      }

      if (!drag.dragging) {
        drag.dragging = true;
        suppressClozeClickRef.current = true;
        setClozeDraggingOptionId(drag.optionId);
        drag.node.style.position = "fixed";
        drag.node.style.left = `${drag.originLeft}px`;
        drag.node.style.top = `${drag.originTop}px`;
        drag.node.style.width = `${drag.width}px`;
        drag.node.style.zIndex = "60";
        drag.node.style.pointerEvents = "none";
        drag.node.style.willChange = "transform";
      }

      drag.pointerX = moveEvent.clientX;
      drag.pointerY = moveEvent.clientY;
      scheduleClozeDragPaint();
    };
    const handleUp = (upEvent) => finishClozeDrag(upEvent);

    clozeDragRef.current = {
      optionId: safeOptionId,
      startX: event.clientX,
      startY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      dragging: false,
      node,
      handleMove,
      handleUp,
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  function handleClozeOption(optionId) {
    if (type !== "cloze" || isResolved) return;
    if (suppressClozeClickRef.current) return;
    clearIncorrectFeedback();
    const safeOptionId = String(optionId || "").trim().toLowerCase();
    if (!safeOptionId) return;
    const selectedEntries = Object.entries(clozeSelections);
    const selectedBlank = selectedEntries.find(([, value]) => String(value || "").toLowerCase() === safeOptionId);
    if (selectedBlank) {
      clearClozeSelection(selectedBlank[0]);
      return;
    }

    const blankKeys = getOrderedClozeBlankKeys();
    const activeKey = String(resolvedActiveClozeBlank || "").toLowerCase();
    let targetKey = "";
    if (activeKey && !clozeSelections[activeKey]) {
      targetKey = activeKey;
    }
    if (!targetKey) {
      targetKey = blankKeys.find((key) => !clozeSelections[key]) || "";
    }
    if (!targetKey) {
      targetKey = blankKeys.find((key) => key === activeKey) || blankKeys[0] || "";
    }
    if (!targetKey) return;
    assignClozeOption(targetKey, safeOptionId);
  }

  function handleScrambleToggle(chipId) {
    if (type !== "scramble" || isResolved) return;
    clearIncorrectFeedback();
    const nextSelected = selectedScrambleIds.includes(chipId)
      ? selectedScrambleIds.filter((id) => id !== chipId)
      : [...selectedScrambleIds, chipId];

    setSelectedScrambleIds(nextSelected);
  }

  function handlePairCard(column, pairId) {
    if (type !== "pairs" || isResolved) return;
    clearIncorrectFeedback();

    const nextLeft = column === "left"
      ? (selectedLeftPair === pairId ? null : pairId)
      : selectedLeftPair;
    const nextRight = column === "right"
      ? (selectedRightPair === pairId ? null : pairId)
      : selectedRightPair;

    setSelectedLeftPair(nextLeft);
    setSelectedRightPair(nextRight);
    if (!nextLeft || !nextRight) {
      return;
    }

    setPairAssignments((current) => {
      const next = { ...current };
      Object.keys(next).forEach((leftId) => {
        if (next[leftId] === nextRight) delete next[leftId];
      });
      next[nextLeft] = nextRight;
      return next;
    });

    setSelectedLeftPair(null);
    setSelectedRightPair(null);
  }

  function handleImageSelect(index) {
    if (type !== "image_match" || isResolved) return;
    clearIncorrectFeedback();
    setSelectedImageIndex(index);
  }

  function handleListeningAnswer(questionId, patchObject) {
    if ((type !== "audio_match" && type !== "reading_exercise") || isResolved) return;
    clearIncorrectFeedback();
    const safeQuestionId = String(questionId || "").trim();
    if (!safeQuestionId) return;
    setListeningAnswersByExercise((current) => {
      const currentExerciseAnswers = current[listeningExerciseKey] || {};
      return {
        ...current,
        [listeningExerciseKey]: {
          ...currentExerciseAnswers,
          [safeQuestionId]: {
            ...(currentExerciseAnswers[safeQuestionId] || {}),
            ...patchObject,
          },
        },
      };
    });
  }

  function showIncompleteResponse() {
    if (isResolved) return;
    setFeedback({ kind: "incomplete", text: "Completa tu respuesta antes de continuar." });
    setErrorFlash(true);
    window.setTimeout(() => setErrorFlash(false), 240);
  }

  function buildAutoFailedSubmission(snapshotValue = null) {
    const safeSnapshot =
      snapshotValue && typeof snapshotValue === "object" && !Array.isArray(snapshotValue)
        ? snapshotValue
        : null;
    if (!isResolved) {
      setFinalStatus("failed");
      setScoreAwarded(0);
      if (safeSnapshot) {
        setResultSnapshot(safeSnapshot);
      }
      setFeedback(null);
      setErrorFlash(false);
    }
    return buildSubmissionPayload("failed", 0, safeSnapshot);
  }

  useImperativeHandle(ref, () => ({
    evaluateAndGetSubmission() {
      const evaluated = evaluateCurrentAnswer({ allowIncomplete: true });
      if (evaluated) return evaluated;
      return (
        buildSubmissionPayload(finalStatus, scoreAwarded, resultSnapshot) ||
        buildAutoFailedSubmission(resultSnapshot)
      );
    },
  }));

  function blockClipboardEvent(event) {
    event.preventDefault();
  }

  function handleExerciseSelectStart(event) {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      String(target.type || "").toLowerCase() === "hidden"
    ) {
      return;
    }
    event.preventDefault();
  }

  function evaluateCurrentAnswer(options = {}) {
    const allowIncomplete = Boolean(options?.allowIncomplete);
    if (isResolved) {
      return buildSubmissionPayload(finalStatus, scoreAwarded, resultSnapshot);
    }

    if (type === "cloze") {
      const blanks = normalizeArray(data.blanks);
      if (!blanks.length) {
        if (allowIncomplete) {
          return buildAutoFailedSubmission(buildClozeAnswerSnapshot(data, clozeSelections));
        }
        showIncompleteResponse();
        return null;
      }
      const unresolved = blanks.some(
        (blank) => !String(clozeSelections[String(blank.key || "").toLowerCase()] || "").trim()
      );
      if (unresolved) {
        if (allowIncomplete) {
          return buildAutoFailedSubmission(buildClozeAnswerSnapshot(data, clozeSelections));
        }
        showIncompleteResponse();
        return null;
      }
      const allCorrect = blanks.every((blank) => {
        const key = String(blank.key || "").toLowerCase();
        const selected = String(clozeSelections[key] || "").toLowerCase();
        const expected = String(blank.correctOptionId || "").toLowerCase();
        return Boolean(expected && selected && selected === expected);
      });
      const correctCount = blanks.filter((blank) => {
        const key = String(blank.key || "").toLowerCase();
        const selected = String(clozeSelections[key] || "").toLowerCase();
        const expected = String(blank.correctOptionId || "").toLowerCase();
        return Boolean(expected && selected && selected === expected);
      }).length;
      const itemStats = {
        correctItems: correctCount,
        totalItems: blanks.length,
      };
      const clozeSnapshot = buildClozeAnswerSnapshot(data, clozeSelections);
      setResultSnapshot(clozeSnapshot);
      if (allCorrect) {
        return markPassed(itemStats, clozeSnapshot);
      }
      return markFailed({
        itemStats,
      }, clozeSnapshot);
    }

    if (type === "scramble") {
      const answerWords = normalizeArray(data.answerWords);
      const candidate = selectedScrambleIds.map((id) => scrambleChipMap.get(id)).filter(Boolean);
      const scrambleSnapshot = buildScrambleAnswerSnapshot(data, candidate);
      setResultSnapshot(scrambleSnapshot);
      if (!answerWords.length || selectedScrambleIds.length !== answerWords.length) {
        if (allowIncomplete) {
          return buildAutoFailedSubmission(scrambleSnapshot);
        }
        showIncompleteResponse();
        return null;
      }
      if (isArrayEqual(candidate, answerWords)) {
        return markPassed(null, scrambleSnapshot);
      }
      return markFailed({}, scrambleSnapshot);
    }

    if (type === "pairs") {
      const requiredIds = pairRows.map((pair) => pair.id);
      const hasAllPairs = requiredIds.every((pairId) => pairAssignments[pairId]);
      const pairsSnapshot = buildPairsAnswerSnapshot(pairRows, pairAssignments);
      setResultSnapshot(pairsSnapshot);
      if (!requiredIds.length || !hasAllPairs) {
        if (allowIncomplete) {
          return buildAutoFailedSubmission(pairsSnapshot);
        }
        showIncompleteResponse();
        return null;
      }
      const correctCount = requiredIds.filter((pairId) => pairAssignments[pairId] === pairId).length;
      const itemStats = {
        correctItems: correctCount,
        totalItems: requiredIds.length,
      };
      if (correctCount === requiredIds.length) {
        return markPassed(itemStats, pairsSnapshot);
      }
      return markFailed({
        itemStats,
      }, pairsSnapshot);
    }

    if (type === "image_match") {
      const imageSnapshot = buildImageMatchAnswerSnapshot(data, selectedImageIndex);
      setResultSnapshot(imageSnapshot);
      if (selectedImageIndex == null) {
        if (allowIncomplete) {
          return buildAutoFailedSubmission(imageSnapshot);
        }
        showIncompleteResponse();
        return null;
      }
      if (selectedImageIndex === data.correctIndex) {
        return markPassed(null, imageSnapshot);
      }
      return markFailed({}, imageSnapshot);
    }

    const summary = summarizeListeningQuestionResults(normalizeArray(data.questions), listeningAnswers);
    const questionSetSnapshot = buildQuestionSetAnswerSnapshot(normalizeArray(data.questions), listeningAnswers, summary);
    setResultSnapshot(questionSetSnapshot);
    if (!summary.total || !summary.complete) {
      if (allowIncomplete) {
        return buildAutoFailedSubmission(questionSetSnapshot);
      }
      showIncompleteResponse();
      return null;
    }
    const itemStats = {
      correctItems: summary.correctCount,
      totalItems: summary.total,
    };
    if (summary.correctCount === summary.total) {
      return markPassed(itemStats, questionSetSnapshot);
    }
    return markFailed({
      itemStats,
    }, questionSetSnapshot);
  }

  function handleContinueSubmit(event) {
    if (!showSubmitButton) {
      event.preventDefault();
      return;
    }
    if (isSubmitting) {
      event.preventDefault();
      return;
    }
    if (!isResolved) {
      evaluateCurrentAnswer({ allowIncomplete: true });
    }
    setIsSubmitting(true);
  }

  const clozeSegments = useMemo(
    () => (type === "cloze" ? normalizeArray(data.segments) : []),
    [type, data.segments]
  );

  const listeningQuestions = useMemo(
    () => ((type === "audio_match" || type === "reading_exercise") ? normalizeArray(data.questions) : []),
    [type, data.questions]
  );
  const listeningSummary = useMemo(
    () => (
      type === "audio_match" || type === "reading_exercise"
        ? summarizeListeningQuestionResults(listeningQuestions, listeningAnswers)
        : { total: 0, answeredCount: 0, correctCount: 0, complete: false, results: [] }
    ),
    [type, listeningQuestions, listeningAnswers]
  );
  function renderCloze() {
    const blanks = normalizeArray(data.blanks);
    const optionsPool = normalizeArray(data.optionsPool);
    const blankWidthClass = "w-24 sm:w-[6rem]";
    const snapshotByKey = new Map(
      resultSnapshot?.type === "cloze"
        ? normalizeArray(resultSnapshot.blanks).map((blank) => [
            String(blank?.key || "").trim().toLowerCase(),
            blank,
          ])
        : []
    );
    const optionById = new Map(
      optionsPool.map((option) => [
        String(option?.id || "").trim().toLowerCase(),
        String(option?.text || "").trim(),
      ])
    );
    const activeKey = String(resolvedActiveClozeBlank || "").toLowerCase();
    const selectedOptionIds = new Set(
      Object.values(clozeSelections)
        .map((value) => String(value || "").toLowerCase())
        .filter(Boolean)
    );
    const visibleOptions = optionsPool.filter((option, optionIdx) => {
      const optionId = String(option?.id || `opt_${optionIdx + 1}`).trim().toLowerCase();
      const optionText = String(option?.text || "").trim();
      return Boolean(optionText) && !selectedOptionIds.has(optionId);
    });

    return (
      <div className="space-y-2.5">
        <div
          className={`rounded-lg px-1.5 py-1.5 text-base font-semibold text-foreground sm:text-lg transition ${
            errorFlash ? "bg-danger/5" : ""
          }`}
        >
          <div className="whitespace-pre-wrap leading-10">
            {clozeSegments.map((segment, idx) => {
            if (segment.kind !== "blank") {
              return <span key={`segment-text-${idx}`}>{segment.value}</span>;
            }
            const key = String(segment.key || "").toLowerCase();
            const selectedOptionId = String(clozeSelections[key] || "").toLowerCase();
            const selectedValue = optionById.get(selectedOptionId) || "";
            const isActive = !isResolved && activeKey === key;
            const blankResult = snapshotByKey.get(key);
            const isCorrectBlank = isResolved && Boolean(blankResult?.isCorrect);
            const isWrongBlank = isResolved && !blankResult?.isCorrect;

            return (
              <span
                key={`segment-blank-${key}-${idx}`}
                role="button"
                tabIndex={0}
                data-cloze-blank-key={key}
                onClick={() => {
                  if (suppressClozeClickRef.current) return;
                  if (isResolved) return;
                  if (selectedOptionId && !isResolved) {
                    clearClozeSelection(key);
                    return;
                  }
                  setActiveClozeBlank(key);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (isResolved) return;
                    if (selectedOptionId && !isResolved) {
                      clearClozeSelection(key);
                      return;
                    }
                    setActiveClozeBlank(key);
                  }
                }}
                className={`mx-0.5 inline-flex h-8 ${blankWidthClass} items-center justify-center overflow-hidden rounded-lg border-2 px-2 py-1 align-middle text-sm font-bold leading-none transition-all duration-200 ease-out sm:h-8 sm:text-base ${
                  isCorrectBlank
                    ? "border-success bg-success/15 text-success"
                    : isWrongBlank
                    ? "border-danger/70 bg-danger/12 text-danger"
                    : selectedOptionId
                    ? "border-primary/70 bg-primary/12 text-foreground"
                    : "border-dashed border-primary/55 bg-primary/10 text-foreground"
                } ${isActive ? "ring-2 ring-primary/40" : ""}`}
              >
                {selectedValue ? (
                  <span
                    onPointerDown={(event) => handleClozePointerDown(event, selectedOptionId)}
                    className={`flex h-full w-full items-center justify-center rounded-md px-2 text-center ${
                      isResolved ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                    }`}
                  >
                    <span className="block w-full truncate text-center">{selectedValue}</span>
                  </span>
                ) : null}
              </span>
            );
            })}
          </div>
        </div>

        <div className="pt-1">
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-2">
            {visibleOptions.length ? visibleOptions.map((option, optionIdx) => {
              const optionId = String(option?.id || `opt_${optionIdx + 1}`).trim().toLowerCase();
              const optionText = String(option?.text || "").trim();
              const isDraggingThisOption =
                String(clozeDraggingOptionId || "").trim().toLowerCase() === optionId;
              return (
                <button
                  key={`cloze-pool-option-${optionId}-${optionIdx}`}
                  type="button"
                  onPointerDown={(event) => handleClozePointerDown(event, optionId)}
                  onClick={() => handleClozeOption(optionId)}
                  disabled={isResolved}
                  className={`${blankWidthClass} inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-surface px-2 py-1.5 text-center text-sm font-semibold transition-all duration-200 ease-out hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-85 sm:min-h-10 sm:text-base ${
                    isDraggingThisOption ? "pointer-events-none z-50 shadow-2xl ring-2 ring-primary/35" : "cursor-grab active:cursor-grabbing"
                  }`}
                >
                  <span className="block w-full truncate text-center">{optionText}</span>
                </button>
              );
            }) : (
              <span className="text-base text-muted">Todas las opciones ya fueron usadas.</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderScramble() {
    return (
      <div className="space-y-5">
        <p className="text-2xl font-bold leading-snug text-foreground sm:text-3xl">
          {data.prompt || "Ordena la oracion."}
        </p>

        <div className={`rounded-2xl border bg-surface-2 px-4 py-4 transition ${errorFlash ? "border-danger/70" : "border-border"}`}>
          <p className="mb-2 text-sm uppercase tracking-wide text-muted">Tu respuesta</p>
          <div className="flex min-h-12 flex-wrap gap-2">
            {selectedScrambleWords.length ? (
              selectedScrambleWords.map((word, idx) => (
                <button
                  key={`selected-word-${idx}`}
                  type="button"
                  onClick={() => {
                    const chipId = selectedScrambleIds[idx];
                    handleScrambleToggle(chipId);
                  }}
                  disabled={isResolved}
                  className="rounded-full border border-primary bg-primary px-3 py-1.5 text-base font-semibold text-primary-foreground disabled:cursor-not-allowed"
                >
                  {word}
                </button>
              ))
            ) : (
              <span className="text-base text-muted">Selecciona palabras para formar la frase.</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {scrambleChips.map((chip) => {
            const selected = selectedScrambleIds.includes(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleScrambleToggle(chip.id)}
                disabled={isResolved}
                className={`rounded-full border px-3 py-1.5 text-base font-semibold transition ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-foreground hover:border-primary hover:bg-surface-2"
                } disabled:cursor-not-allowed disabled:opacity-85`}
              >
                {chip.word}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderPairs() {
    const assignedRightIds = new Set(Object.values(pairAssignments).filter(Boolean));
    return (
      <div className="space-y-5">
        <p className="text-base text-muted">Selecciona un termino de cada columna para emparejarlos.</p>

        <div
          ref={pairBoardRef}
          className={`relative rounded-2xl border bg-surface-2 p-4 transition sm:p-5 ${errorFlash ? "border-danger/70" : "border-border"}`}
        >
          <div className="grid grid-cols-2 gap-5 sm:gap-6">
            <div className="space-y-3">
              <p className="px-1 text-xs uppercase tracking-wide text-muted">Idioma A</p>
              {leftPairCards.map((card) => {
                const paired = Boolean(pairAssignments[card.pairId]);
                const selected = selectedLeftPair === card.pairId;
                return (
                  <button
                    key={`left-${card.pairId}`}
                    ref={(node) => {
                      if (node) leftPairRefs.current.set(card.pairId, node);
                      else leftPairRefs.current.delete(card.pairId);
                    }}
                    type="button"
                    disabled={isResolved}
                    onClick={() => handlePairCard("left", card.pairId)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-base font-semibold transition ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : paired
                        ? "border-success/55 bg-success/15 text-success"
                        : "border-border bg-surface text-foreground hover:border-primary hover:bg-surface-2"
                    } disabled:cursor-not-allowed disabled:opacity-90`}
                  >
                    {card.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              <p className="px-1 text-xs uppercase tracking-wide text-muted">Idioma B</p>
              {rightPairCards.map((card) => {
                const paired = assignedRightIds.has(card.pairId);
                const selected = selectedRightPair === card.pairId;
                return (
                  <button
                    key={`right-${card.pairId}`}
                    ref={(node) => {
                      if (node) rightPairRefs.current.set(card.pairId, node);
                      else rightPairRefs.current.delete(card.pairId);
                    }}
                    type="button"
                    disabled={isResolved}
                    onClick={() => handlePairCard("right", card.pairId)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-base font-semibold transition ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : paired
                        ? "border-success/55 bg-success/15 text-success"
                        : "border-border bg-surface text-foreground hover:border-primary hover:bg-surface-2"
                    } disabled:cursor-not-allowed disabled:opacity-90`}
                  >
                    {card.label}
                  </button>
                );
              })}
            </div>
          </div>

          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {pairLines.map((line) => (
              <line
                key={line.key}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={line.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={line.dashed ? "6 5" : undefined}
                opacity={line.dashed ? 0.9 : 1}
              />
            ))}
          </svg>
        </div>
      </div>
    );
  }

  function renderImageMatch() {
    return (
      <div className="space-y-4">
        <p className="text-base text-muted">{data.question || "Que palabra corresponde a la imagen?"}</p>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-2">
          {data.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.imageUrl} alt="Imagen del ejercicio" className="h-56 w-full object-cover sm:h-64" />
          ) : (
            <div className="flex h-56 items-center justify-center text-sm text-muted sm:h-64">
              Imagen no disponible
            </div>
          )}
        </div>
        <div className={`grid gap-3 sm:grid-cols-2 ${errorFlash ? "shake-soft" : ""}`}>
          {normalizeArray(data.options).map((option, idx) => {
            const selected = selectedImageIndex === idx;
            const resolvedCorrect = isResolved && !isFailed && idx === data.correctIndex;
            const selectedWrong =
              feedback?.kind === "incorrect" &&
              selected &&
              idx !== data.correctIndex;
            return (
              <button
                key={option.id || `image-${idx}`}
                type="button"
                onClick={() => handleImageSelect(idx)}
                disabled={isResolved}
                className={`overflow-hidden rounded-2xl border text-left transition ${
                  resolvedCorrect
                    ? "border-success bg-success/10"
                    : selectedWrong
                    ? "border-danger/70 bg-danger/10"
                    : selected
                    ? "border-primary bg-primary/12"
                    : "border-border bg-surface hover:border-primary hover:bg-surface-2"
                } disabled:cursor-not-allowed`}
              >
                <div className="px-3 py-3 text-base font-semibold text-foreground">{option.label || `Opcion ${idx + 1}`}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderQuestionExerciseQuestions(canAnswerQuestions = true) {
    const flatListeningLayout = type === "audio_match";
    const resultByQuestionId = new Map(
      normalizeArray(listeningSummary.results).map((entry) => [
        String(entry?.id || "").trim(),
        entry,
      ])
    );

    return (
      <>
        {listeningSummary.total > 0 ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Preguntas respondidas: {listeningSummary.answeredCount}/{listeningSummary.total}
            {isResolved ? ` | Aciertos: ${listeningSummary.correctCount}/${listeningSummary.total}` : ""}
          </p>
        ) : null}

        <div className={flatListeningLayout ? "space-y-4" : "space-y-3"}>
          {listeningQuestions.map((question, questionIndex) => {
            const questionId = String(question?.id || `q_${questionIndex + 1}`).trim();
            const answerState = listeningAnswers[questionId] || {};
            const result = resultByQuestionId.get(questionId) || null;
            const questionStatusClasses = isResolved
              ? Boolean(result?.isCorrect)
                ? "text-success"
                : "text-danger"
              : "text-muted";

            return (
              <div
                key={`listening-question-${questionId}-${questionIndex}`}
                className={
                  flatListeningLayout
                    ? "space-y-3 py-1"
                    : `rounded-2xl border p-4 transition ${
                        isResolved
                          ? Boolean(result?.isCorrect)
                            ? "border-success/55 bg-success/10"
                            : "border-danger/45 bg-danger/10"
                          : "border-border bg-surface-2"
                      }`
                }
              >
                <div className="flex items-start gap-2">
                  <span className={`w-6 shrink-0 text-sm font-semibold ${questionStatusClasses}`}>
                    {questionIndex + 1}.
                  </span>
                  <p className="min-w-0 flex-1 text-base font-semibold text-foreground">{question.prompt}</p>
                </div>

                {question.type === LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {normalizeArray(question.options).map((option, optionIndex) => {
                      const selected = Number(answerState.selected_index) === optionIndex;
                      const correctOption = Number(question.correct_index) === optionIndex;
                      const resolvedCorrect = isResolved && !isFailed && correctOption;
                      const showWrong = isFailed && selected && !correctOption;
                      return (
                        <button
                          key={`${questionId}-option-${optionIndex}`}
                          type="button"
                          onClick={() => handleListeningAnswer(questionId, { selected_index: optionIndex })}
                          disabled={isResolved || !canAnswerQuestions}
                      className={`rounded-xl border px-3 py-2 text-left text-base font-semibold transition ${
                            resolvedCorrect
                              ? "border-success bg-success/15 text-success"
                              : showWrong
                              ? "border-danger/70 bg-danger/12 text-danger"
                              : selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-surface text-foreground hover:border-primary hover:bg-surface-2"
                          } disabled:cursor-not-allowed disabled:opacity-90`}
                        >
                          {option || `Option ${optionIndex + 1}`}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {question.type === LISTENING_QUESTION_TYPES.WRITTEN ? (
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      value={answerState.text || ""}
                      onChange={(event) => handleListeningAnswer(questionId, { text: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.preventDefault();
                      }}
                      onCopy={blockClipboardEvent}
                      onCut={blockClipboardEvent}
                      onPaste={blockClipboardEvent}
                      disabled={isResolved || !canAnswerQuestions}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-base text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-90 select-none"
                      placeholder="Write your answer"
                    />
                  </div>
                ) : null}

                {question.type === LISTENING_QUESTION_TYPES.TRUE_FALSE ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {["True", "False"].map((label, optionIndex) => {
                      const boolValue = optionIndex === 0;
                      const selected = answerState.value === boolValue;
                      const correctOption = Boolean(question.correct_boolean) === boolValue;
                      const resolvedCorrect = isResolved && !isFailed && correctOption;
                      const showWrong = isFailed && selected && !correctOption;
                      return (
                        <button
                          key={`${questionId}-${label}`}
                          type="button"
                          onClick={() => handleListeningAnswer(questionId, { value: boolValue })}
                          disabled={isResolved || !canAnswerQuestions}
                          className={`rounded-xl border px-3 py-2 text-left text-base font-semibold transition ${
                            resolvedCorrect
                              ? "border-success bg-success/15 text-success"
                              : showWrong
                              ? "border-danger/70 bg-danger/12 text-danger"
                              : selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-surface text-foreground hover:border-primary hover:bg-surface-2"
                          } disabled:cursor-not-allowed disabled:opacity-90`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

              </div>
            );
          })}
        </div>
      </>
    );
  }

  function renderAudioMatch() {
    return (
      <div className="space-y-5">
        <p className="text-base text-muted">{data.prompt || "Escucha y responde."}</p>

        <ListeningPlaybackControl
          key={`listening-playback-${exercise?.id || currentIndex}-${data.youtubeUrl || data.audioUrl || "none"}-${data.maxPlays}-${data.startTime ?? 0}-${data.endTime ?? "end"}`}
          youtubeUrl={data.youtubeUrl}
          audioUrl={data.audioUrl}
          maxPlays={data.maxPlays}
          startTime={data.startTime}
          endTime={data.endTime}
          onStatusChange={setListeningPlaybackState}
        />

        {renderQuestionExerciseQuestions(true)}
      </div>
    );
  }

  function renderReadingExercise() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-surface-2 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Reading</p>
          <h3 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
            {data.title || "Reading Exercise"}
          </h3>
          {data.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.imageUrl}
              alt={data.title || "Reading image"}
              className="mt-4 h-52 w-full rounded-2xl object-cover sm:h-64"
            />
          ) : null}
          <div className="mt-4 whitespace-pre-wrap text-base leading-8 text-foreground">
            {data.readingText || "Reading text not available."}
          </div>
        </div>

        {renderQuestionExerciseQuestions(true)}
      </div>
    );
  }

  function renderBodyByType() {
    if (type === "cloze") return renderCloze();
    if (type === "scramble") return renderScramble();
    if (type === "pairs") return renderPairs();
    if (type === "image_match") return renderImageMatch();
    if (type === "reading_exercise") return renderReadingExercise();
    return renderAudioMatch();
  }

  return (
    <div
      ref={exerciseRootRef}
      className="space-y-4 select-none text-base sm:space-y-5"
      onCopy={blockClipboardEvent}
      onCut={blockClipboardEvent}
      onPaste={blockClipboardEvent}
    >
      {showTypeHeading ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ExerciseTypeHeading type={type} />
        </div>
      ) : null}

      {renderBodyByType()}

      {feedback?.kind === "correct" ? (
        <div className="rounded-2xl border border-success/45 bg-success/12 px-4 py-3 text-base font-semibold text-success">
          Correcto!
        </div>
      ) : null}

      {feedback?.kind === "incorrect" ? (
        <div className="rounded-2xl border border-danger/45 bg-danger/12 px-4 py-3 text-base font-semibold text-danger">
          {feedback.text}
        </div>
      ) : null}

      {feedback?.kind === "incomplete" ? (
        <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-base font-semibold text-muted">
          {feedback.text}
        </div>
      ) : null}

      {showSubmitButton ? (
        <form
          action={submitLessonQuizStep}
          onSubmit={handleContinueSubmit}
          className="pt-1"
        >
          <input type="hidden" name="lessonId" value={lessonId} />
          <input type="hidden" name="exerciseId" value={exercise?.id || ""} />
          <input type="hidden" name="currentIndex" value={currentIndex} />
          <input type="hidden" name="totalExercises" value={totalExercises} />
          <input type="hidden" name="wrongAttempts" value="0" />
          <input type="hidden" name="finalStatus" value={finalStatus || ""} />
          <input type="hidden" name="scoreAwarded" value={scoreAwarded} />
          <input type="hidden" name="answerSnapshot" value={answerSnapshotValue} />
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3.5 text-lg font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Guardando..." : "Continuar"}
          </button>
        </form>
      ) : null}
    </div>
  );
});

export default LessonQuizPlayer;
