"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ListeningPlaybackControl from "@/components/listening-playback-control";
import {
  buildListeningQuestionsFromContent,
  getListeningEndTime,
  getListeningMaxPlays,
  getListeningPrompt,
  getListeningQuestionCorrectAnswerText,
  getListeningStartTime,
  LISTENING_QUESTION_TYPES,
  summarizeListeningQuestionResults,
} from "@/lib/listening-exercise";
import { submitLessonQuizStep } from "../actions";

const MAX_WRONG_ATTEMPTS = 1;

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

function computeExerciseScore(weight, wrongAttempts, finalStatus, itemStats = null) {
  let ratio = finalStatus === "passed" ? 1 : 0;
  const correctItems = Number(itemStats?.correctItems);
  const totalItems = Number(itemStats?.totalItems);
  if (Number.isFinite(correctItems) && Number.isFinite(totalItems) && totalItems > 0) {
    ratio = Math.min(1, Math.max(0, correctItems / totalItems));
  }
  if (ratio <= 0) return 0;
  const wrong = Math.max(0, Math.min(2, Number(wrongAttempts) || 0));
  const multipliers = [1, 0.8, 0.6];
  return round2((Number(weight) || 0) * ratio * multipliers[wrong]);
}

function isArrayEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let idx = 0; idx < a.length; idx += 1) {
    if (normalizeText(a[idx]) !== normalizeText(b[idx])) return false;
  }
  return true;
}

function buildScrambleSolutionIds(answerWords = [], chips = []) {
  const used = new Set();
  const result = [];
  answerWords.forEach((word) => {
    const normalizedWord = normalizeText(word);
    const match = chips.find((chip) => {
      if (used.has(chip.id)) return false;
      return normalizeText(chip.word) === normalizedWord;
    });
    if (match) {
      used.add(match.id);
      result.push(match.id);
    }
  });
  return result;
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

function extractBlankTokens(sentence = "") {
  const text = String(sentence || "");
  const regex = /\[\[\s*(blank_[a-z0-9_-]+)\s*\]\]/gi;
  const tokens = [];
  const seen = new Set();
  let match = regex.exec(text);
  while (match) {
    const key = String(match[1] || "").trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      tokens.push(key);
    }
    match = regex.exec(text);
  }
  return tokens;
}

function splitSentenceByBlankTokens(sentence = "") {
  const text = String(sentence || "");
  const regex = /\[\[\s*(blank_[a-z0-9_-]+)\s*\]\]/gi;
  const segments = [];
  let lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "blank", key: String(match[1] || "").trim().toLowerCase() });
    lastIndex = match.index + match[0].length;
    match = regex.exec(text);
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return segments.length ? segments : [{ kind: "text", value: text }];
}

function getDefaultExplanation(type, data) {
  if (type === "cloze") return "Se usa la opcion gramatical correcta para completar la frase.";
  if (type === "scramble") return "El orden correcto sigue sujeto + verbo + complemento.";
  if (type === "pairs") return "Estos son los pares correctos entre ambos idiomas.";
  if (type === "image_match") return "La imagen correcta corresponde al termino solicitado.";
  if (type === "audio_match") return "Las respuestas correctas se obtienen a partir del audio escuchado.";
  if (type === "reading_exercise") return "Las respuestas correctas se obtienen a partir del texto de lectura.";
  if (data?.correctAnswer) return "Esa es la respuesta correcta para este ejercicio.";
  return "Revisa la solucion para entender la regla de este ejercicio.";
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
    const normalizeOptionIds = (values, minCount = 0) => {
      const ids = Array.from(
        new Set(
          normalizeArray(values)
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .map((value) => ensurePoolOption(value, ""))
        )
      );
      while (ids.length < minCount) {
        ids.push(appendPoolOption(""));
      }
      return ids;
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
    const hasPoolShape =
      rawPool.length > 0 ||
      rawBlanks.some((blank) => {
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
      blanks = rawBlanks.map((blank, idx) => {
        const source = blank && typeof blank === "object" ? blank : {};
        const key = String(source.id || source.key || `blank_${idx + 1}`).trim().toLowerCase();
        const minOptions = idx === 0 ? 4 : 2;
        let newOptionIds = normalizeOptionIds(source.new_option_ids || source.newOptionIds, minOptions);
        if (!newOptionIds.length && optionsPool.length) {
          newOptionIds = normalizeOptionIds(
            optionsPool.slice(0, minOptions).map((option) => option.id),
            minOptions
          );
        }

        let correctOptionId = String(source.correct_option_id || source.correctOptionId || "").trim();
        if (correctOptionId) {
          correctOptionId = ensurePoolOption(correctOptionId, "");
        }
        if (!correctOptionId && newOptionIds.length) {
          const fromIndex = Math.max(0, Math.min(newOptionIds.length - 1, Number(source.correct_index) || 0));
          correctOptionId = newOptionIds[fromIndex];
        }
        if (!correctOptionId) {
          const answerText = String(source.answer || source.correct || "").trim();
          if (answerText) {
            const byText = optionsPool.find(
              (option) => normalizeText(option.text) === normalizeText(answerText)
            );
            correctOptionId = byText?.id || appendPoolOption(answerText);
            if (!newOptionIds.includes(correctOptionId)) {
              newOptionIds.push(correctOptionId);
            }
          }
        }
        if (!correctOptionId) {
          correctOptionId = newOptionIds[0] || appendPoolOption("");
        }
        if (idx > 0 && !newOptionIds.includes(correctOptionId)) {
          correctOptionId = newOptionIds[0] || appendPoolOption("");
        }

        return {
          key,
          correctOptionId,
          newOptionIds: Array.from(new Set(newOptionIds)),
        };
      });
    }

    if (!blanks.length) {
      const legacyBlanks = rawBlanks.length
        ? rawBlanks
        : [{
          key: "blank_1",
          options: normalizeArray(content.options).map((value) => String(value || "").trim()).filter(Boolean),
          correct_index: Number(content.correct_index || 0),
          answer: String(content.answer || content.correct || "").trim(),
        }];

      blanks = legacyBlanks.map((blank, idx) => {
        const source = blank && typeof blank === "object" ? blank : {};
        const key = String(source.key || source.id || `blank_${idx + 1}`).trim().toLowerCase();
        const minOptions = idx === 0 ? 4 : 2;
        const optionTexts = normalizeArray(source.options).map((value) => String(value || "").trim());
        const answerText = String(source.answer || source.correct || "").trim();
        if (answerText && !optionTexts.some((value) => normalizeText(value) === normalizeText(answerText))) {
          optionTexts.push(answerText);
        }
        while (optionTexts.length < minOptions) {
          optionTexts.push("");
        }
        const optionIds = optionTexts.map((text) => appendPoolOption(text));
        const correctIndex = Math.max(0, Math.min(optionIds.length - 1, Number(source.correct_index) || 0));
        const correctOptionId = optionIds[correctIndex] || optionIds[0] || appendPoolOption("");
        return {
          key,
          correctOptionId,
          newOptionIds: optionIds,
        };
      });
    }

    if (!sentence) sentence = "I ____ a student.";
    if (!extractBlankTokens(sentence).length && blanks.length) {
      if (/_{2,}/.test(sentence)) {
        sentence = sentence.replace(/_{2,}/, `[[${blanks[0].key || "blank_1"}]]`);
      } else {
        sentence = `${sentence} [[${blanks[0].key || "blank_1"}]]`.trim();
      }
    }

    const orderedKeys = extractBlankTokens(sentence);
    const blankByKey = new Map(blanks.map((blank) => [blank.key, blank]));
    const orderedBlanks = orderedKeys.map((key, idx) => {
      const current = blankByKey.get(key) || {};
      const minOptions = idx === 0 ? 4 : 2;
      const newOptionIds = normalizeOptionIds(current.newOptionIds || current.new_option_ids, minOptions);
      let correctOptionId = String(current.correctOptionId || current.correct_option_id || "").trim();
      if (correctOptionId) {
        correctOptionId = ensurePoolOption(correctOptionId, "");
      }
      if (!correctOptionId || (idx > 0 && !newOptionIds.includes(correctOptionId))) {
        correctOptionId = newOptionIds[0] || appendPoolOption("");
      }
      return {
        key,
        correctOptionId,
        newOptionIds,
      };
    });

    const segments = splitSentenceByBlankTokens(sentence);
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

function buildCorrectAnswerText(type, data) {
  if (type === "cloze") {
    const blanks = normalizeArray(data.blanks);
    const poolMap = new Map(
      normalizeArray(data.optionsPool).map((option) => [
        String(option?.id || "").trim(),
        String(option?.text || "").trim(),
      ])
    );
    if (!blanks.length) return "-";
    return blanks
      .map((blank, idx) => {
        const correct = poolMap.get(String(blank.correctOptionId || "").trim()) || "-";
        return `Blank ${idx + 1}: ${correct}`;
      })
      .join(" | ");
  }
  if (type === "scramble") return normalizeArray(data.answerWords).join(" ");
  if (type === "pairs") {
    return normalizeArray(data.pairs)
      .map((pair) => `${pair.left} = ${pair.right}`)
      .join(" | ");
  }
  if (type === "image_match") {
    const correct = data.options?.[data.correctIndex];
    return correct?.label || correct?.vocabId || "Opcion correcta";
  }
  if (type === "audio_match" || type === "reading_exercise") {
    const questions = normalizeArray(data.questions);
    if (!questions.length && data.textTarget) return data.textTarget;
    if (!questions.length) return "-";
    return questions
      .map((question, idx) => `Q${idx + 1}: ${getListeningQuestionCorrectAnswerText(question)}`)
      .join(" | ");
  }
  return "-";
}

function ExerciseTypeHeading({ type }) {
  const label = TYPE_LABELS[String(type || "").trim()] || "Ejercicio";
  return (
    <p className="text-lg font-semibold text-foreground sm:text-xl">
      {label}
    </p>
  );
}

export default function LessonQuizPlayer({
  lessonId,
  currentIndex,
  totalExercises,
  exercise,
  exercisePointValues = [],
  revealCorrectAnswers = false,
}) {
  const data = useMemo(() => resolveExerciseData(exercise), [exercise]);
  const type = data.type;
  const listeningExerciseKey = String(exercise?.id || `${lessonId}-${currentIndex}`);
  const exerciseWeight = useMemo(
    () => computeExerciseWeightFromPoints(totalExercises, currentIndex, exercisePointValues),
    [totalExercises, currentIndex, exercisePointValues]
  );

  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [finalStatus, setFinalStatus] = useState(null);
  const [scoreAwarded, setScoreAwarded] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [errorFlash, setErrorFlash] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [clozeSelections, setClozeSelections] = useState({});
  const [activeClozeBlank, setActiveClozeBlank] = useState(null);

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
  const leftPairRefs = useRef(new Map());
  const rightPairRefs = useRef(new Map());
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

  const correctAnswerText = useMemo(() => buildCorrectAnswerText(type, data), [type, data]);
  const explanationText = String(data.explanation || getDefaultExplanation(type, data)).trim();
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

  function clearIncorrectFeedback() {
    if (feedback?.kind === "incorrect" || feedback?.kind === "incomplete") {
      setFeedback(null);
      setErrorFlash(false);
    }
  }

  function markPassed(itemStats = null) {
    if (isResolved) return;
    const awarded = computeExerciseScore(exerciseWeight, wrongAttempts, "passed", itemStats);
    setFinalStatus("passed");
    setScoreAwarded(awarded);
    setFeedback({ kind: "correct", text: "Correcto!" });
    setErrorFlash(false);
  }

  function markFailed(onReveal, options = {}) {
    if (isResolved) return;
    const awarded = computeExerciseScore(exerciseWeight, wrongAttempts, "failed", options.itemStats);
    setWrongAttempts(MAX_WRONG_ATTEMPTS);
    setFinalStatus("failed");
    setScoreAwarded(awarded);
    const baseScoreMessage = awarded > 0 ? `Puntaje parcial: ${awarded}/${exerciseWeight}.` : "";
    setFeedback({
      kind: "reveal",
      text:
        options.message ||
        (revealCorrectAnswers
          ? `${baseScoreMessage}${baseScoreMessage ? " " : ""}Respuesta correcta mostrada.`
          : `${baseScoreMessage}${baseScoreMessage ? " " : ""}La respuesta correcta se mostrara cuando se agoten tus intentos.`),
    });
    setErrorFlash(false);
    if (typeof onReveal === "function") onReveal();
  }

  function registerIncorrect({ onRetry, onReveal } = {}) {
    if (isResolved) return;
    const nextWrongAttempts = Math.min(MAX_WRONG_ATTEMPTS, wrongAttempts + 1);
    if (nextWrongAttempts >= MAX_WRONG_ATTEMPTS) {
      markFailed(onReveal);
      return;
    }
    setWrongAttempts(nextWrongAttempts);
    setFeedback({ kind: "incorrect", text: "Incorrecto, intenta de nuevo." });
    setErrorFlash(true);
    window.setTimeout(() => setErrorFlash(false), 280);
    if (typeof onRetry === "function") onRetry();
  }

  function assignClozeOption(blankKey, optionId) {
    if (type !== "cloze" || isResolved) return;
    const safeKey = String(blankKey || "").trim().toLowerCase();
    const safeOptionId = String(optionId || "").trim().toLowerCase();
    if (!safeKey) return;
    if (!safeOptionId) return;
    setActiveClozeBlank(safeKey);
    setClozeSelections((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (String(next[key] || "").toLowerCase() === safeOptionId) {
          delete next[key];
        }
      });
      next[safeKey] = safeOptionId;
      return next;
    });
  }

  function handleClozeOption(optionId) {
    if (type !== "cloze" || isResolved) return;
    clearIncorrectFeedback();
    const safeOptionId = String(optionId || "").trim().toLowerCase();
    if (!safeOptionId) return;

    setClozeSelections((current) => {
      const selectedEntries = Object.entries(current);
      const selectedBlank = selectedEntries.find(([, value]) => String(value || "").toLowerCase() === safeOptionId);
      if (selectedBlank) {
        const next = { ...current };
        delete next[selectedBlank[0]];
        return next;
      }

      const blanks = normalizeArray(data.blanks).map((blank, idx) =>
        String(blank?.key || `blank_${idx + 1}`).toLowerCase()
      );
      const activeKey = String(resolvedActiveClozeBlank || "").toLowerCase();
      let targetKey = blanks.find((key) => key === activeKey) || "";
      if (!targetKey) {
        targetKey = blanks.find((key) => !current[key]) || blanks[0] || "";
      }
      if (!targetKey) return current;
      return { ...current, [targetKey]: safeOptionId };
    });
  }

  function handleClozeDrop(event, blankKey) {
    event.preventDefault();
    const draggedOptionId =
      String(event.dataTransfer?.getData("application/x-option-id") || "").trim().toLowerCase() ||
      String(event.dataTransfer?.getData("text/plain") || "").trim().toLowerCase();
    if (!draggedOptionId) return;
    clearIncorrectFeedback();
    const safeKey = String(blankKey || "").trim().toLowerCase();
    const sameSelection = String(clozeSelections[safeKey] || "").toLowerCase() === draggedOptionId;
    if (sameSelection) {
      setClozeSelections((current) => {
        const next = { ...current };
        delete next[safeKey];
        return next;
      });
      return;
    }
    assignClozeOption(safeKey, draggedOptionId);
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

  function evaluateCurrentAnswer() {
    if (isResolved) return;

    if (type === "cloze") {
      const blanks = normalizeArray(data.blanks);
      if (!blanks.length) {
        showIncompleteResponse();
        return;
      }
      const unresolved = blanks.some(
        (blank) => !String(clozeSelections[String(blank.key || "").toLowerCase()] || "").trim()
      );
      if (unresolved) {
        showIncompleteResponse();
        return;
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
      if (allCorrect) {
        markPassed(itemStats);
        return;
      }
      markFailed(() => {
        const solved = {};
        blanks.forEach((blank) => {
          const key = String(blank.key || "").toLowerCase();
          solved[key] = String(blank.correctOptionId || "").toLowerCase();
        });
        setClozeSelections(solved);
      }, {
        itemStats,
      });
      return;
    }

    if (type === "scramble") {
      const answerWords = normalizeArray(data.answerWords);
      if (!answerWords.length || selectedScrambleIds.length !== answerWords.length) {
        showIncompleteResponse();
        return;
      }
      const candidate = selectedScrambleIds.map((id) => scrambleChipMap.get(id)).filter(Boolean);
      if (isArrayEqual(candidate, answerWords)) {
        markPassed();
        return;
      }
      registerIncorrect({
        onReveal: () => {
          setSelectedScrambleIds(buildScrambleSolutionIds(answerWords, scrambleChips));
        },
      });
      return;
    }

    if (type === "pairs") {
      const requiredIds = pairRows.map((pair) => pair.id);
      const hasAllPairs = requiredIds.every((pairId) => pairAssignments[pairId]);
      if (!requiredIds.length || !hasAllPairs) {
        showIncompleteResponse();
        return;
      }
      const correctCount = requiredIds.filter((pairId) => pairAssignments[pairId] === pairId).length;
      const itemStats = {
        correctItems: correctCount,
        totalItems: requiredIds.length,
      };
      if (correctCount === requiredIds.length) {
        markPassed(itemStats);
        return;
      }
      markFailed(() => {
        const solved = {};
        requiredIds.forEach((pairId) => {
          solved[pairId] = pairId;
        });
        setPairAssignments(solved);
        setSelectedLeftPair(null);
        setSelectedRightPair(null);
      }, {
        itemStats,
      });
      return;
    }

    if (type === "image_match") {
      if (selectedImageIndex == null) {
        showIncompleteResponse();
        return;
      }
      if (selectedImageIndex === data.correctIndex) {
        markPassed();
        return;
      }
      registerIncorrect({
        onReveal: () => {
          setSelectedImageIndex(data.correctIndex);
        },
      });
      return;
    }

    const summary = summarizeListeningQuestionResults(normalizeArray(data.questions), listeningAnswers);
    if (!summary.total || !summary.complete) {
      showIncompleteResponse();
      return;
    }
    const itemStats = {
      correctItems: summary.correctCount,
      totalItems: summary.total,
    };
    if (summary.correctCount === summary.total) {
      markPassed(itemStats);
      return;
    }
    markFailed(null, {
      itemStats,
    });
  }

  function handleContinueSubmit(event) {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }
    if (!isResolved) {
      event.preventDefault();
      evaluateCurrentAnswer();
      return;
    }
    setIsSubmitting(true);
  }

  const clozeSegments = useMemo(
    () => (type === "cloze" ? normalizeArray(data.segments) : []),
    [type, data.segments]
  );
  const clozeBlankWeight = useMemo(() => {
    if (type !== "cloze") return null;
    const blanksCount = Math.max(0, normalizeArray(data.blanks).length);
    if (!blanksCount) return null;
    return round2(exerciseWeight / blanksCount);
  }, [type, data.blanks, exerciseWeight]);

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
  const remainingErrors = Math.max(0, MAX_WRONG_ATTEMPTS - wrongAttempts);

  function renderCloze() {
    const blanks = normalizeArray(data.blanks);
    const optionsPool = normalizeArray(data.optionsPool);
    const optionById = new Map(
      optionsPool.map((option) => [
        String(option?.id || "").trim().toLowerCase(),
        String(option?.text || "").trim(),
      ])
    );
    const blankByKey = new Map(
      blanks.map((blank, idx) => [
        String(blank?.key || `blank_${idx + 1}`).toLowerCase(),
        blank,
      ])
    );
    const activeKey = String(resolvedActiveClozeBlank || "").toLowerCase();
    const selectedOptionIds = new Set(
      Object.values(clozeSelections)
        .map((value) => String(value || "").toLowerCase())
        .filter(Boolean)
    );

    return (
      <div className="space-y-5">
        <p className="text-sm text-muted">Completa todos los espacios. Puedes resolver cualquier blank en cualquier orden.</p>
        <div
          className={`rounded-2xl border bg-surface-2 px-4 py-5 text-lg font-semibold transition ${
            errorFlash ? "border-danger/70" : "border-border"
          }`}
        >
          {clozeSegments.map((segment, idx) => {
            if (segment.kind !== "blank") {
              return <span key={`segment-text-${idx}`}>{segment.value}</span>;
            }
            const key = String(segment.key || "").toLowerCase();
            const blank = blankByKey.get(key) || null;
            const selectedOptionId = String(clozeSelections[key] || "").toLowerCase();
            const selectedValue = optionById.get(selectedOptionId) || "";
            const resolvedCorrectOptionId = String(blank?.correctOptionId || "").toLowerCase();
            const isActive = !isResolved && activeKey === key;

            return (
              <span
                key={`segment-blank-${key}-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => setActiveClozeBlank(key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveClozeBlank(key);
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleClozeDrop(event, key)}
                className={`mx-2 my-1 inline-flex min-h-12 min-w-28 items-center justify-center rounded-xl border-2 px-3 py-2 align-middle text-base font-bold transition ${
                  isResolved && !isFailed
                    ? "border-success bg-success/15 text-success"
                    : isFailed
                    ? "border-danger/70 bg-danger/12 text-danger"
                    : selectedOptionId
                    ? "border-primary/70 bg-primary/12 text-foreground"
                    : "border-dashed border-primary/55 bg-primary/10 text-foreground"
                } ${isActive ? "ring-2 ring-primary/40" : ""}`}
              >
                {selectedValue || "____"}
              </span>
            );
          })}
        </div>

        {clozeBlankWeight != null ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Cada blank vale aproximadamente {clozeBlankWeight} puntos.
          </p>
        ) : null}

        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pool global de opciones</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {optionsPool.map((option, optionIdx) => {
              const optionId = String(option?.id || `opt_${optionIdx + 1}`).trim().toLowerCase();
              const selectedInActiveBlank = String(clozeSelections[activeKey] || "").toLowerCase() === optionId;
              const selectedElsewhere = selectedOptionIds.has(optionId) && !selectedInActiveBlank;
              return (
                <button
                  key={`cloze-pool-option-${optionId}-${optionIdx}`}
                  type="button"
                  draggable={!isResolved}
                  onDragStart={(event) => {
                    event.dataTransfer?.setData("application/x-option-id", optionId);
                    event.dataTransfer?.setData("text/plain", optionId);
                  }}
                  onClick={() => handleClozeOption(optionId)}
                  disabled={isResolved}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                    selectedInActiveBlank
                      ? "border-primary bg-primary text-primary-foreground"
                      : selectedElsewhere
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border bg-surface text-foreground hover:border-primary hover:bg-surface-2"
                  } disabled:cursor-not-allowed disabled:opacity-85`}
                >
                  {String(option?.text || "").trim() || "(sin texto)"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderScramble() {
    return (
      <div className="space-y-5">
        <p className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {data.prompt || "Ordena la oracion."}
        </p>

        <div className={`rounded-2xl border bg-surface-2 px-4 py-4 transition ${errorFlash ? "border-danger/70" : "border-border"}`}>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tu respuesta</p>
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
                  className="rounded-full border border-primary bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed"
                >
                  {word}
                </button>
              ))
            ) : (
              <span className="text-sm text-muted">Selecciona palabras para formar la frase.</span>
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
                className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
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
        <p className="text-sm text-muted">Selecciona un termino de cada columna para emparejarlos.</p>

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
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
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
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
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
        <p className="text-sm text-muted">{data.question || "Que palabra corresponde a la imagen?"}</p>
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
            const resolvedCorrect = isResolved && idx === data.correctIndex;
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
                <div className="px-3 py-3 text-sm font-semibold text-foreground">{option.label || `Opcion ${idx + 1}`}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderQuestionExerciseQuestions(canAnswerQuestions = true) {
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

        <div className="space-y-3">
          {listeningQuestions.map((question, questionIndex) => {
            const questionId = String(question?.id || `q_${questionIndex + 1}`).trim();
            const answerState = listeningAnswers[questionId] || {};
            const result = resultByQuestionId.get(questionId) || null;
            const questionIsCorrect = Boolean(result?.isCorrect);
            const questionWasAnswered = Boolean(result?.answered);

            return (
              <div
                key={`listening-question-${questionId}-${questionIndex}`}
                className={`rounded-2xl border p-4 transition ${
                  isResolved
                    ? questionIsCorrect
                      ? "border-success/55 bg-success/10"
                      : "border-danger/45 bg-danger/10"
                    : "border-border bg-surface-2"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Question {questionIndex + 1}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">{question.prompt}</p>

                {question.type === LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {normalizeArray(question.options).map((option, optionIndex) => {
                      const selected = Number(answerState.selected_index) === optionIndex;
                      const correctOption = Number(question.correct_index) === optionIndex;
                      const showWrong = isFailed && selected && !correctOption;
                      return (
                        <button
                          key={`${questionId}-option-${optionIndex}`}
                          type="button"
                          onClick={() => handleListeningAnswer(questionId, { selected_index: optionIndex })}
                          disabled={isResolved || !canAnswerQuestions}
                          className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                            isResolved && correctOption
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
                      disabled={isResolved || !canAnswerQuestions}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-90"
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
                      const showWrong = isFailed && selected && !correctOption;
                      return (
                        <button
                          key={`${questionId}-${label}`}
                          type="button"
                          onClick={() => handleListeningAnswer(questionId, { value: boolValue })}
                          disabled={isResolved || !canAnswerQuestions}
                          className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                            isResolved && correctOption
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

                {isFailed && revealCorrectAnswers && (!questionWasAnswered || !questionIsCorrect) ? (
                  <p className="mt-3 text-xs font-semibold text-danger">
                    Correct answer: {getListeningQuestionCorrectAnswerText(question)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function renderAudioMatch() {
    const hasPlaybackSource = Boolean(data.youtubeUrl || data.audioUrl);
    const canAnswerQuestions = !hasPlaybackSource || listeningPlaybackState.playsUsed > 0;

    return (
      <div className="space-y-5">
        <p className="text-sm text-muted">{data.prompt || "Escucha y responde."}</p>

        <ListeningPlaybackControl
          key={`listening-playback-${exercise?.id || currentIndex}-${data.youtubeUrl || data.audioUrl || "none"}-${data.maxPlays}-${data.startTime ?? 0}-${data.endTime ?? "end"}`}
          youtubeUrl={data.youtubeUrl}
          audioUrl={data.audioUrl}
          maxPlays={data.maxPlays}
          startTime={data.startTime}
          endTime={data.endTime}
          onStatusChange={setListeningPlaybackState}
        />

        {!canAnswerQuestions ? (
          <div className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-muted">
            Reproduce el audio al menos una vez antes de responder.
          </div>
        ) : listeningPlaybackState.isPlaying ? (
          <div className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-muted">
            Puedes responder mientras el audio sigue sonando.
          </div>
        ) : null}

        {renderQuestionExerciseQuestions(canAnswerQuestions)}
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
          <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground">
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExerciseTypeHeading type={type} />
        <p className="text-sm font-semibold text-muted">
          Errores disponibles: {remainingErrors}
        </p>
      </div>

      {renderBodyByType()}

      {feedback?.kind === "correct" ? (
        <div className="rounded-2xl border border-success/45 bg-success/12 px-4 py-3 text-sm font-semibold text-success">
          Correcto!
        </div>
      ) : null}

      {feedback?.kind === "incorrect" ? (
        <div className="rounded-2xl border border-danger/45 bg-danger/12 px-4 py-3 text-sm font-semibold text-danger">
          Incorrecto, intenta de nuevo.
        </div>
      ) : null}

      {feedback?.kind === "incomplete" ? (
        <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-muted">
          {feedback.text}
        </div>
      ) : null}

      {feedback?.kind === "reveal" ? (
        <div className="rounded-2xl border border-accent/45 bg-accent/12 px-4 py-3 text-sm font-semibold text-foreground">
          {feedback.text}
        </div>
      ) : null}

      {isFailed && revealCorrectAnswers ? (
        <div className="space-y-2 rounded-2xl border border-accent/45 bg-accent/12 px-4 py-3 text-sm text-foreground">
          <p className="text-xs uppercase tracking-wide text-muted">Respuesta correcta</p>
          <p className="font-semibold">{correctAnswerText}</p>
          <p className="text-muted">{explanationText}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
        Valor del ejercicio: {exerciseWeight}/100
        {isResolved ? (
          <span className="ml-2 inline-flex rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-foreground">
            Puntaje actual: {scoreAwarded}
          </span>
        ) : null}
      </div>

      <form
        action={submitLessonQuizStep}
        onSubmit={handleContinueSubmit}
        className="pt-1"
      >
        <input type="hidden" name="lessonId" value={lessonId} />
        <input type="hidden" name="exerciseId" value={exercise?.id || ""} />
        <input type="hidden" name="currentIndex" value={currentIndex} />
        <input type="hidden" name="totalExercises" value={totalExercises} />
        <input type="hidden" name="wrongAttempts" value={wrongAttempts} />
        <input type="hidden" name="finalStatus" value={finalStatus || ""} />
        <input type="hidden" name="scoreAwarded" value={scoreAwarded} />
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Guardando..." : "Continuar"}
        </button>
      </form>
    </div>
  );
}
