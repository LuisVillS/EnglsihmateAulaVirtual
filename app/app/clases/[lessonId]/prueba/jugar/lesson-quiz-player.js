"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { submitLessonQuizStep } from "../actions";

const MAX_WRONG_ATTEMPTS = 3;

const TYPE_LABELS = {
  scramble: "Scrambled Sentence",
  audio_match: "Audio Match",
  image_match: "Image Match",
  pairs: "Pairs",
  cloze: "Cloze",
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

function computeExerciseScore(weight, wrongAttempts, finalStatus) {
  if (finalStatus !== "passed") return 0;
  const wrong = Math.max(0, Math.min(2, Number(wrongAttempts) || 0));
  const multipliers = [1, 0.8, 0.6];
  return round2((Number(weight) || 0) * multipliers[wrong]);
}

function splitSentenceWithBlank(sentence) {
  const text = String(sentence || "");
  const match = text.match(/_{2,}/);
  if (match?.index !== 0 && !match?.index) {
    return { before: text, after: "" };
  }
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  return { before, after };
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

function getDefaultExplanation(type, data) {
  if (type === "cloze") return "Se usa la opcion gramatical correcta para completar la frase.";
  if (type === "scramble") return "El orden correcto sigue sujeto + verbo + complemento.";
  if (type === "pairs") return "Estos son los pares correctos entre ambos idiomas.";
  if (type === "image_match") return "La imagen correcta corresponde al termino solicitado.";
  if (type === "audio_match") return "La respuesta correcta coincide con lo que se escucha.";
  if (data?.correctAnswer) return "Esa es la respuesta correcta para este ejercicio.";
  return "Revisa la solucion para entender la regla de este ejercicio.";
}

function resolveExerciseData(exercise) {
  const content = exercise?.content_json || {};
  const type = String(exercise?.type || "").trim();
  const explanation = String(content.explanation || "").trim();

  if (type === "cloze") {
    const options = normalizeArray(content.options).map((value) => String(value || "").trim()).filter(Boolean);
    const sentence = String(content.sentence || exercise?.prompt || "I ____ a student.");
    const correctByIndex = options[Math.max(0, Number(content.correct_index) || 0)] || "";
    const correctAnswer = String(content.correct || content.answer || correctByIndex || "").trim();
    return { type, explanation, sentence, options, correctAnswer };
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
    if (!scrambledWords.length && targetWords.length) scrambledWords = [...targetWords];
    if (!scrambledWords.length && answerWords.length) scrambledWords = shuffleList(answerWords);

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
    const options = normalizeArray(content.options).map((option, idx) => ({
      id: String(idx),
      imageUrl: String(option?.image_url || "").trim(),
      vocabId: String(option?.vocab_id || "").trim(),
      label: String(
        option?.label || option?.word_native || option?.word_target || option?.vocab_id || `Opcion ${idx + 1}`
      ).trim(),
    }));
    const correctByIndex = Math.max(0, Math.min(options.length - 1, Number(content.correct_index) || 0));
    const correctByVocab = String(content.correct_vocab_id || "").trim();
    const correctIndex = correctByVocab
      ? Math.max(0, options.findIndex((option) => option.vocabId === correctByVocab))
      : correctByIndex;
    return {
      type,
      explanation,
      question: String(content.question_native || exercise?.prompt || "Selecciona la imagen correcta."),
      options,
      correctIndex,
    };
  }

  if (type === "audio_match") {
    const options = normalizeArray(content.options).map((option) => String(option || "").trim()).filter(Boolean);
    const mode = String(content.mode || "dictation").trim().toLowerCase();
    const correctByIndex = options[Math.max(0, Number(content.correct_index) || 0)] || "";
    const correctText = String(content.correct || content.answer || correctByIndex || content.text_target || "").trim();
    return {
      type,
      explanation,
      mode,
      textTarget: String(content.text_target || exercise?.prompt || "Escucha y responde."),
      audioUrl: String(content.audio_url || "").trim(),
      options,
      correctText,
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
  if (type === "cloze") return data.correctAnswer || "-";
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
  if (type === "audio_match") return data.correctText || "-";
  return "-";
}

function TypeBadge({ type }) {
  const label = TYPE_LABELS[String(type || "").trim()] || "Ejercicio";
  return (
    <span className="inline-flex rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
      {label}
    </span>
  );
}

export default function LessonQuizPlayer({ lessonId, currentIndex, totalExercises, exercise }) {
  const data = useMemo(() => resolveExerciseData(exercise), [exercise]);
  const type = data.type;
  const exerciseWeight = useMemo(
    () => computeExerciseWeight(totalExercises, currentIndex),
    [totalExercises, currentIndex]
  );

  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [finalStatus, setFinalStatus] = useState(null);
  const [scoreAwarded, setScoreAwarded] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [errorFlash, setErrorFlash] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [placedOption, setPlacedOption] = useState(null);
  const [draggedClozeOption, setDraggedClozeOption] = useState(null);

  const [selectedScrambleIds, setSelectedScrambleIds] = useState([]);

  const [selectedLeftPair, setSelectedLeftPair] = useState(null);
  const [selectedRightPair, setSelectedRightPair] = useState(null);
  const [pairAssignments, setPairAssignments] = useState({});

  const [selectedImageIndex, setSelectedImageIndex] = useState(null);

  const [audioInput, setAudioInput] = useState("");
  const [selectedAudioOption, setSelectedAudioOption] = useState(null);

  const clozeResetTimerRef = useRef(null);

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

  const isResolved = finalStatus === "passed" || finalStatus === "failed";
  const isFailed = finalStatus === "failed";

  useEffect(() => {
    if (type !== "pairs") return undefined;
    const handleResize = () => setPairLinesTick((value) => value + 1);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [type]);

  useEffect(() => {
    return () => {
      if (clozeResetTimerRef.current) clearTimeout(clozeResetTimerRef.current);
    };
  }, []);

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

  function markPassed() {
    if (isResolved) return;
    const awarded = computeExerciseScore(exerciseWeight, wrongAttempts, "passed");
    setFinalStatus("passed");
    setScoreAwarded(awarded);
    setFeedback({ kind: "correct", text: "Correcto!" });
    setErrorFlash(false);
  }

  function markFailed(onReveal) {
    if (isResolved) return;
    setWrongAttempts(MAX_WRONG_ATTEMPTS);
    setFinalStatus("failed");
    setScoreAwarded(0);
    setFeedback({ kind: "reveal", text: "Respuesta correcta mostrada." });
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

  function handleClozeOption(option) {
    if (type !== "cloze" || isResolved) return;
    clearIncorrectFeedback();
    if (clozeResetTimerRef.current) clearTimeout(clozeResetTimerRef.current);

    const safeOption = String(option || "").trim();
    if (!safeOption) return;
    if (normalizeText(placedOption) === normalizeText(safeOption)) {
      setPlacedOption(null);
      return;
    }
    setPlacedOption(safeOption);
  }

  function handleClozeDrop(event) {
    event.preventDefault();
    if (!draggedClozeOption) return;
    handleClozeOption(draggedClozeOption);
    setDraggedClozeOption(null);
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

  function handleAudioOptionSelect(index) {
    if (type !== "audio_match" || isResolved) return;
    clearIncorrectFeedback();
    setSelectedAudioOption(index);
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
      if (!placedOption) {
        showIncompleteResponse();
        return;
      }
      if (normalizeText(placedOption) === normalizeText(data.correctAnswer)) {
        markPassed();
        return;
      }
      registerIncorrect({
        onRetry: () => {
          clozeResetTimerRef.current = window.setTimeout(() => {
            setPlacedOption(null);
          }, 430);
        },
        onReveal: () => {
          setPlacedOption(data.correctAnswer);
        },
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
      const isCorrect = requiredIds.every((pairId) => pairAssignments[pairId] === pairId);
      if (isCorrect) {
        markPassed();
        return;
      }
      registerIncorrect({
        onReveal: () => {
          const solved = {};
          requiredIds.forEach((pairId) => {
            solved[pairId] = pairId;
          });
          setPairAssignments(solved);
          setSelectedLeftPair(null);
          setSelectedRightPair(null);
        },
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

    const candidate = isAudioDictation
      ? normalizeText(audioInput)
      : normalizeText(data.options?.[selectedAudioOption] || "");
    if (!candidate) {
      showIncompleteResponse();
      return;
    }
    if (candidate === normalizeText(data.correctText)) {
      markPassed();
      return;
    }
    registerIncorrect({
      onReveal: () => {
        if (data.options?.length) {
          const correctIdx = data.options.findIndex(
            (option) => normalizeText(option) === normalizeText(data.correctText)
          );
          setSelectedAudioOption(correctIdx >= 0 ? correctIdx : null);
        } else {
          setAudioInput(data.correctText);
        }
      },
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

  const { before: clozeBefore, after: clozeAfter } = useMemo(
    () => splitSentenceWithBlank(data.sentence),
    [data.sentence]
  );

  const isAudioDictation = type === "audio_match" && (!data.options?.length || data.mode === "dictation");
  const remainingErrors = Math.max(0, MAX_WRONG_ATTEMPTS - wrongAttempts);

  function renderCloze() {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted">Arrastra la opcion correcta al espacio en blanco.</p>
        <div
          className={`rounded-2xl border bg-surface-2 px-4 py-5 text-lg font-semibold transition ${
            errorFlash ? "border-danger/70" : "border-border"
          }`}
        >
          <span>{clozeBefore}</span>
          <span
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleClozeDrop}
            onClick={() => {
              if (!isResolved && placedOption) {
                clearIncorrectFeedback();
                setPlacedOption(null);
              }
            }}
            className={`mx-2 inline-flex min-h-12 min-w-28 items-center justify-center rounded-xl border-2 px-3 py-2 align-middle text-base font-bold transition ${
              isResolved && !isFailed
                ? "border-success bg-success/15 text-success"
                : isFailed
                ? "border-danger/70 bg-danger/12 text-danger"
                : "cursor-pointer border-dashed border-primary/55 bg-primary/10 text-foreground"
            }`}
          >
            {placedOption || "____"}
          </span>
          <span>{clozeAfter}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {normalizeArray(data.options).map((option, idx) => {
            const selected = normalizeText(option) === normalizeText(placedOption);
            return (
              <button
                key={`cloze-option-${idx}`}
                type="button"
                draggable={!isResolved}
                onDragStart={() => setDraggedClozeOption(option)}
                onDragEnd={() => setDraggedClozeOption(null)}
                onClick={() => handleClozeOption(option)}
                disabled={isResolved}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-foreground hover:border-primary hover:bg-surface-2"
                } disabled:cursor-not-allowed disabled:opacity-85`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderScramble() {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted">{data.prompt || "Ordena la oracion."}</p>

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
      <div className="space-y-4">
        <p className="text-sm text-muted">Selecciona un termino de cada columna para emparejarlos.</p>

        <div ref={pairBoardRef} className={`relative rounded-2xl border bg-surface-2 p-3 transition ${errorFlash ? "border-danger/70" : "border-border"}`}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
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
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
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

            <div className="space-y-2">
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
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
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
        <p className="text-sm text-muted">{data.question || "Selecciona la opcion correcta."}</p>
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
                {option.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.imageUrl} alt={option.label || `opcion-${idx + 1}`} className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-surface-2 text-xs text-muted">Imagen {idx + 1}</div>
                )}
                <div className="px-3 py-2 text-sm font-semibold text-foreground">{option.label || `Opcion ${idx + 1}`}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderAudioMatch() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">{data.textTarget || "Escucha y responde."}</p>
        {data.audioUrl ? (
          <audio controls src={data.audioUrl} className="w-full rounded-xl border border-border bg-surface" />
        ) : (
          <div className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            Audio disponible al publicar este ejercicio.
          </div>
        )}

        {isAudioDictation ? (
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted">Escribe lo que escuchas</label>
            <input
              type="text"
              value={audioInput}
              onChange={(event) => {
                if (!isResolved) clearIncorrectFeedback();
                setAudioInput(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              disabled={isResolved}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-90"
              placeholder="Escribe tu respuesta"
            />
            <p className="text-xs text-muted">Presiona Continuar para validar.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {normalizeArray(data.options).map((option, idx) => {
              const selected = selectedAudioOption === idx;
              const resolvedCorrect = isResolved && normalizeText(option) === normalizeText(data.correctText);
              return (
                <button
                  key={`audio-option-${idx}`}
                  type="button"
                  onClick={() => handleAudioOptionSelect(idx)}
                  disabled={isResolved}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                    resolvedCorrect
                      ? "border-success bg-success/15 text-success"
                      : selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-foreground hover:border-primary hover:bg-surface-2"
                  } disabled:cursor-not-allowed disabled:opacity-90`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderBodyByType() {
    if (type === "cloze") return renderCloze();
    if (type === "scramble") return renderScramble();
    if (type === "pairs") return renderPairs();
    if (type === "image_match") return renderImageMatch();
    return renderAudioMatch();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TypeBadge type={type} />
        <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
          Errores disponibles: {remainingErrors}
        </span>
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

      {isFailed ? (
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
