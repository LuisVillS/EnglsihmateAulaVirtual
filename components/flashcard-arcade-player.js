"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FLASHCARD_GAME_MODES,
  FLASHCARD_GAME_MODE_LABELS,
} from "@/lib/flashcard-arcade/constants";
import {
  buildDeckProgressSummary,
  buildFlashcardProgressUpdate,
} from "@/lib/flashcard-arcade/progress";

function shuffleArray(list = []) {
  const next = [...list];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function normalizeCards(cards = []) {
  return [...(cards || [])]
    .map((card, index) => ({
      id: String(card?.id || card?.flashcardId || `flashcard-${index + 1}`),
      flashcardId: String(card?.flashcardId || card?.id || "").trim(),
      word: String(card?.word || "").trim(),
      meaning: String(card?.meaning || "").trim(),
      image: String(card?.image || "").trim(),
      audioUrl: String(card?.audioUrl || card?.audio_url || "").trim(),
      audioR2Key: String(card?.audioR2Key || card?.audio_r2_key || "").trim(),
      order: Number(card?.order || index + 1) || index + 1,
      acceptedAnswers: Array.isArray(card?.acceptedAnswers) ? card.acceptedAnswers : [],
      progress: card?.progress || {
        seenCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        masteryScore: 0,
        masteryStage: "new",
      },
    }))
    .sort((left, right) => left.order - right.order);
}

function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getAcceptedAnswers(card) {
  return Array.from(
    new Set(
      [card?.word, ...(Array.isArray(card?.acceptedAnswers) ? card.acceptedAnswers : [])]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function matchesAnswer(card, candidate) {
  const target = normalizeAnswer(candidate);
  if (!target) return false;
  return getAcceptedAnswers(card).some((answer) => normalizeAnswer(answer) === target);
}

function pickPreferredEnglishVoice(voices = []) {
  const list = Array.isArray(voices) ? voices : [];
  const byName = (value) => String(value || "").trim().toLowerCase();
  const byLang = (value) => String(value || "").trim().toLowerCase();

  return (
    list.find((voice) => byName(voice?.name).includes("microsoft jenny")) ||
    list.find((voice) => byLang(voice?.lang) === "en-us") ||
    list.find((voice) => byLang(voice?.lang).startsWith("en")) ||
    null
  );
}

function aggregateResults(rows = []) {
  const grouped = new Map();

  for (const row of rows) {
    const flashcardId = String(row?.flashcardId || "").trim();
    if (!flashcardId) continue;
    const current = grouped.get(flashcardId) || {
      flashcard_id: flashcardId,
      seen_count: 0,
      correct_count: 0,
      incorrect_count: 0,
      response_ms: null,
      event_type: String(row?.eventType || "").trim().toLowerCase() || "seen",
      payload: {},
    };

    current.seen_count += Math.max(0, Number(row?.seenCount || 0) || 0);
    current.correct_count += Math.max(0, Number(row?.correctCount || 0) || 0);
    current.incorrect_count += Math.max(0, Number(row?.incorrectCount || 0) || 0);
    if (row?.responseMs != null) {
      const currentMs = current.response_ms == null ? 0 : Number(current.response_ms || 0) || 0;
      current.response_ms = currentMs + Math.max(0, Number(row.responseMs) || 0);
    }
    current.payload = {
      ...current.payload,
      ...(row?.payload && typeof row.payload === "object" ? row.payload : {}),
    };

    grouped.set(flashcardId, current);
  }

  return Array.from(grouped.values());
}

function createSpeedRound(cards = [], promptCard) {
  if (!promptCard) return null;
  const distractors = shuffleArray(cards.filter((card) => card.id !== promptCard.id)).slice(0, 3);
  const options = shuffleArray([promptCard, ...distractors]);
  const promptKinds = ["meaning", "image"];
  if (promptCard.audioUrl || promptCard.audioR2Key || promptCard.flashcardId || promptCard.word) {
    promptKinds.push("audio");
  }

  return {
    promptCard,
    promptType: promptKinds[Math.floor(Math.random() * promptKinds.length)],
    options,
    startedAt: Date.now(),
  };
}

function buildMemoryTiles(cards = []) {
  const selectedCards = shuffleArray(cards).slice(0, Math.min(6, cards.length));
  const tiles = selectedCards.flatMap((card, index) => ([
    {
      tileId: `${card.id}-word-${index}`,
      flashcardId: card.flashcardId || card.id,
      label: card.word,
      variant: "word",
    },
    {
      tileId: `${card.id}-meaning-${index}`,
      flashcardId: card.flashcardId || card.id,
      label: card.meaning,
      variant: "meaning",
    },
  ]));
  return shuffleArray(tiles);
}

function buildRun(mode, cards, gameSessionId) {
  const normalizedCards = normalizeCards(cards);

  if (mode === FLASHCARD_GAME_MODES.STUDY) {
    return {
      mode,
      gameSessionId,
      startedAt: Date.now(),
      shuffled: false,
      order: normalizedCards.map((_, index) => index),
      index: 0,
      flipped: false,
      seenIds: [],
    };
  }

  if (mode === FLASHCARD_GAME_MODES.SPEED_MATCH) {
    const queue = shuffleArray(normalizedCards).slice(0, Math.min(12, normalizedCards.length));
    return {
      mode,
      gameSessionId,
      startedAt: Date.now(),
      queue,
      roundIndex: 0,
      round: createSpeedRound(normalizedCards, queue[0] || null),
      answerLog: [],
      combo: 0,
      comboMax: 0,
      score: 0,
      timeLeft: 60,
    };
  }

  if (mode === FLASHCARD_GAME_MODES.WRITING_SPRINT) {
    const queue = shuffleArray(normalizedCards).slice(0, Math.min(12, normalizedCards.length));
    return {
      mode,
      gameSessionId,
      startedAt: Date.now(),
      queue,
      index: 0,
      input: "",
      answerLog: [],
      score: 0,
      timeLeft: 75,
      feedback: "",
    };
  }

  if (mode === FLASHCARD_GAME_MODES.MEMORY_GRID) {
    return {
      mode,
      gameSessionId,
      startedAt: Date.now(),
      tiles: buildMemoryTiles(normalizedCards),
      selectedIds: [],
      solvedIds: [],
      answerLog: [],
      turns: 0,
      score: 0,
      lock: false,
    };
  }

  return null;
}

function formatStage(stage) {
  return String(stage || "new")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 9v6h4l5 4V5L9 9H5Z" />
      <path d="M18 9.5a4.5 4.5 0 0 1 0 5" />
      <path d="M20.5 7a8 8 0 0 1 0 10" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 4h4v4" />
      <path d="M20 4l-6.5 6.5" />
      <path d="M4 7h4l8 10H20" />
      <path d="M20 16v4h-4" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function StatCard({ label, value, accent = "" }) {
  return (
    <div className={`rounded-[18px] border border-[rgba(16,52,116,0.1)] bg-white px-4 py-4 ${accent}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ModeCard({ title, description, actionLabel, onClick, disabled = false, tone = "" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[18px] border border-[rgba(16,52,116,0.1)] bg-white p-5 text-left shadow-[0_14px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-60 ${tone}`}
    >
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      <p className="mt-4 text-sm font-semibold text-primary">{actionLabel}</p>
    </button>
  );
}

export default function FlashcardArcadePlayer({
  deck,
  gamification = null,
  embedded = false,
  initialMode = "",
  sourceContext = "flashcard_arcade",
  onGamificationChange,
  onCompetitionChange,
  onExit,
}) {
  const [deckState, setDeckState] = useState(deck);
  const [activeRun, setActiveRun] = useState(null);
  const [loadingMode, setLoadingMode] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [completionSummary, setCompletionSummary] = useState(null);
  const [error, setError] = useState("");
  const [ttsMessage, setTtsMessage] = useState("");
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const finishRunRef = useRef(null);
  const playCardAudioRef = useRef(null);
  const autoModeRef = useRef(false);

  useEffect(() => {
    setDeckState(deck);
    setActiveRun(null);
    setCompletionSummary(null);
    autoModeRef.current = false;
  }, [deck]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {
          // no-op
        }
        audioRef.current = null;
      }
      if (
        typeof window !== "undefined" &&
        window.speechSynthesis &&
        typeof window.SpeechSynthesisUtterance !== "undefined"
      ) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    finishRunRef.current = finishRun;
    playCardAudioRef.current = playCardAudio;
  });

  useEffect(() => {
    if (!activeRun || ![FLASHCARD_GAME_MODES.SPEED_MATCH, FLASHCARD_GAME_MODES.WRITING_SPRINT].includes(activeRun.mode)) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return undefined;
    }

    timerRef.current = window.setInterval(() => {
      setActiveRun((current) => {
        if (!current || current.mode !== activeRun.mode) return current;
        if (current.timeLeft <= 1) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
          void finishRunRef.current?.(current);
          return current;
        }
        return {
          ...current,
          timeLeft: current.timeLeft - 1,
        };
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeRun]);

  useEffect(() => {
    if (!activeRun || activeRun.mode !== FLASHCARD_GAME_MODES.SPEED_MATCH) {
      return;
    }

    if (activeRun.round?.promptType === "audio" && activeRun.round?.promptCard) {
      void playCardAudioRef.current?.(activeRun.round.promptCard);
    }
  }, [activeRun]);

  const cards = useMemo(() => normalizeCards(deckState?.cards || []), [deckState?.cards]);
  const deckStats = useMemo(
    () => buildDeckProgressSummary(cards, new Map(cards.map((card) => [card.flashcardId, card.progress]))),
    [cards]
  );
  const currentLevel = Number(gamification?.level || 1) || 1;

  function stopCurrentPlayback() {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // no-op
      }
      audioRef.current = null;
    }

    if (
      typeof window !== "undefined" &&
      window.speechSynthesis &&
      typeof window.SpeechSynthesisUtterance !== "undefined"
    ) {
      window.speechSynthesis.cancel();
    }
  }

  function speakWordFallback(word, errorMessage = "Audio no disponible en tu navegador.") {
    if (
      typeof window === "undefined" ||
      !window.speechSynthesis ||
      typeof window.SpeechSynthesisUtterance === "undefined" ||
      !word
    ) {
      setTtsMessage(errorMessage);
      return;
    }

    try {
      const synthesis = window.speechSynthesis;
      const voices = synthesis.getVoices();
      const preferredVoice = pickPreferredEnglishVoice(voices);
      const utterance = new window.SpeechSynthesisUtterance(word);
      utterance.lang = preferredVoice?.lang || "en-US";
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      utterance.onend = () => setTtsMessage("");
      utterance.onerror = () => setTtsMessage("No se pudo reproducir el audio.");
      setTtsMessage("");
      synthesis.cancel();
      synthesis.speak(utterance);
    } catch {
      setTtsMessage("No se pudo reproducir el audio.");
    }
  }

  async function playCardAudio(card) {
    const word = String(card?.word || "").trim();
    let audioUrl = String(card?.audioUrl || "").trim();
    const flashcardId = String(card?.flashcardId || "").trim();
    const audioR2Key = String(card?.audioR2Key || "").trim();

    stopCurrentPlayback();

    if (typeof window === "undefined") {
      setTtsMessage("Audio no disponible.");
      return;
    }

    if (flashcardId || audioR2Key) {
      const searchParams = new URLSearchParams();
      if (flashcardId) {
        searchParams.set("flashcardId", flashcardId);
      } else if (audioR2Key) {
        searchParams.set("r2Key", audioR2Key);
      }
      searchParams.set("ts", String(Date.now()));
      audioUrl = `/api/flashcards/audio?${searchParams.toString()}`;
    }

    if (audioUrl) {
      try {
        const audio = new window.Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          if (audioRef.current === audio) {
            audioRef.current = null;
          }
        };
        audio.onerror = () => {
          if (audioRef.current === audio) {
            audioRef.current = null;
          }
          speakWordFallback(word, "No se pudo reproducir el audio guardado.");
        };
        await audio.play();
        return;
      } catch {
        speakWordFallback(word, "No se pudo reproducir el audio guardado.");
        return;
      }
    }

    speakWordFallback(word);
  }

  function patchDeckProgress(resultRows = []) {
    const progressByCardId = new Map(
      resultRows.map((row) => [
        String(row?.flashcard_id || "").trim(),
        {
          seenCount: Number(row?.seen_count || 0) || 0,
          correctCount: Number(row?.correct_count || 0) || 0,
          incorrectCount: Number(row?.incorrect_count || 0) || 0,
        },
      ])
    );

    setDeckState((currentDeck) => {
      if (!currentDeck) return currentDeck;
      const nextCards = normalizeCards(currentDeck.cards || []).map((card) => {
        const delta = progressByCardId.get(card.flashcardId);
        if (!delta) return card;
        const nextProgress = buildFlashcardProgressUpdate(card.progress, delta);
        return {
          ...card,
          progress: {
            ...card.progress,
            ...nextProgress,
          },
        };
      });

      return {
        ...currentDeck,
        cards: nextCards,
      };
    });
  }

  const beginMode = useCallback(async (mode) => {
    if (!deckState?.deckKey || !cards.length) return;
    setError("");
    setLoadingMode(mode);

    try {
      const response = await fetch("/api/flashcards/arcade/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deck_key: deckState.deckKey,
          mode,
          source_context: sourceContext,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo iniciar el modo seleccionado.");
      }

      startTransition(() => {
        setCompletionSummary(null);
        setActiveRun(buildRun(mode, cards, data?.gameSession?.id || ""));
      });
    } catch (modeError) {
      setError(modeError.message || "No se pudo iniciar el modo seleccionado.");
    } finally {
      setLoadingMode("");
    }
  }, [cards, deckState?.deckKey, sourceContext]);

  useEffect(() => {
    const normalizedMode = String(initialMode || "").trim().toLowerCase();
    if (!normalizedMode || autoModeRef.current || !deckState?.deckKey || !cards.length || activeRun || completionSummary) {
      return;
    }
    autoModeRef.current = true;
    void beginMode(normalizedMode);
  }, [activeRun, beginMode, cards.length, completionSummary, deckState?.deckKey, initialMode]);

  async function finishRun(run, { completed = true, silent = false } = {}) {
    if (!run?.gameSessionId) {
      setActiveRun(null);
      return;
    }

    let resultRows = [];
    let score = Number(run?.score || 0) || 0;
    let comboMax = Number(run?.comboMax || 0) || 0;
    let livesLeft = run?.livesLeft ?? null;
    const durationSec = Math.max(1, Math.round((Date.now() - Number(run?.startedAt || Date.now())) / 1000));

    if (run.mode === FLASHCARD_GAME_MODES.STUDY) {
      resultRows = Array.from(new Set(run.seenIds || [])).map((flashcardId) => ({
        flashcardId,
        seenCount: 1,
        correctCount: 0,
        incorrectCount: 0,
        eventType: "seen",
      }));
    } else {
      resultRows = run.answerLog || [];
    }

    const aggregated = aggregateResults(resultRows);
    setSavingSummary(true);
    setError("");

    try {
      const response = await fetch("/api/flashcards/arcade/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game_session_id: run.gameSessionId,
          mode: run.mode,
          score,
          combo_max: comboMax,
          lives_left: livesLeft,
          duration_sec: durationSec,
          completed,
          cards: aggregated,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cerrar la sesion.");
      }

      patchDeckProgress(aggregated);

      if (data?.gamification) {
        onGamificationChange?.(data.gamification);
      }
      if (data?.competition) {
        onCompetitionChange?.(data.competition);
      }

      if (!silent) {
        setCompletionSummary({
          ...(data?.session || {}),
          modeLabel: FLASHCARD_GAME_MODE_LABELS[run.mode] || "Flashcards",
        });
      }
      setActiveRun(null);
    } catch (summaryError) {
      setError(summaryError.message || "No se pudo cerrar la sesion.");
    } finally {
      setSavingSummary(false);
    }
  }

  function handleStudyFlip() {
    setActiveRun((current) => {
      if (!current || current.mode !== FLASHCARD_GAME_MODES.STUDY) return current;
      const currentCard = cards[current.order[current.index]];
      const nextSeenIds = current.flipped || !currentCard
        ? current.seenIds
        : Array.from(new Set([...current.seenIds, currentCard.flashcardId || currentCard.id]));
      return {
        ...current,
        flipped: !current.flipped,
        seenIds: nextSeenIds,
      };
    });
  }

  function handleStudyShuffle() {
    setActiveRun((current) => {
      if (!current || current.mode !== FLASHCARD_GAME_MODES.STUDY) return current;
      const nextShuffled = !current.shuffled;
      return {
        ...current,
        shuffled: nextShuffled,
        order: nextShuffled ? shuffleArray(cards.map((_, index) => index)) : cards.map((_, index) => index),
        index: 0,
        flipped: false,
      };
    });
  }

  function goToStudyIndex(nextIndex) {
    setActiveRun((current) => {
      if (!current || current.mode !== FLASHCARD_GAME_MODES.STUDY) return current;
      const bounded = Math.max(0, Math.min(nextIndex, current.order.length - 1));
      return {
        ...current,
        index: bounded,
        flipped: false,
      };
    });
  }

  function handleSpeedAnswer(optionId) {
    setActiveRun((current) => {
      if (!current || current.mode !== FLASHCARD_GAME_MODES.SPEED_MATCH || !current.round) return current;
      const responseMs = Date.now() - Number(current.round.startedAt || Date.now());
      const isCorrect = String(optionId) === String(current.round.promptCard.id);
      const nextCombo = isCorrect ? current.combo + 1 : 0;
      const nextScore = Math.max(0, current.score + (isCorrect ? 100 + (current.combo * 10) : -10));
      const nextLog = [
        ...current.answerLog,
        {
          flashcardId: current.round.promptCard.flashcardId || current.round.promptCard.id,
          seenCount: 1,
          correctCount: isCorrect ? 1 : 0,
          incorrectCount: isCorrect ? 0 : 1,
          responseMs,
          eventType: "match",
          payload: {
            prompt_type: current.round.promptType,
          },
        },
      ];
      const nextRoundIndex = current.roundIndex + 1;
      const nextRoundCard = current.queue[nextRoundIndex] || null;
      if (!nextRoundCard) {
        void finishRun({
          ...current,
          answerLog: nextLog,
          score: nextScore,
          combo: nextCombo,
          comboMax: Math.max(current.comboMax, nextCombo),
        });
        return {
          ...current,
          answerLog: nextLog,
          score: nextScore,
          combo: nextCombo,
          comboMax: Math.max(current.comboMax, nextCombo),
        };
      }

      return {
        ...current,
        answerLog: nextLog,
        combo: nextCombo,
        comboMax: Math.max(current.comboMax, nextCombo),
        score: nextScore,
        roundIndex: nextRoundIndex,
        round: createSpeedRound(cards, nextRoundCard),
      };
    });
  }

  function handleWritingSubmit() {
    setActiveRun((current) => {
      if (!current || current.mode !== FLASHCARD_GAME_MODES.WRITING_SPRINT) return current;
      const currentCard = current.queue[current.index] || null;
      if (!currentCard) return current;
      const isCorrect = matchesAnswer(currentCard, current.input);
      const nextLog = [
        ...current.answerLog,
        {
          flashcardId: currentCard.flashcardId || currentCard.id,
          seenCount: 1,
          correctCount: isCorrect ? 1 : 0,
          incorrectCount: isCorrect ? 0 : 1,
          responseMs: 0,
          eventType: "write",
        },
      ];
      const nextState = {
        ...current,
        answerLog: nextLog,
        input: "",
        score: current.score + (isCorrect ? 120 : 0),
        feedback: isCorrect ? "Correct" : `Answer: ${currentCard.word}`,
      };

      if (current.index + 1 >= current.queue.length) {
        void finishRun(nextState);
        return nextState;
      }

      return {
        ...nextState,
        index: current.index + 1,
      };
    });
  }

  function handleMemoryTile(tileId) {
    setActiveRun((current) => {
      if (!current || current.mode !== FLASHCARD_GAME_MODES.MEMORY_GRID || current.lock) return current;
      if (current.selectedIds.includes(tileId) || current.solvedIds.includes(tileId)) return current;
      const nextSelected = [...current.selectedIds, tileId];
      if (nextSelected.length < 2) {
        return {
          ...current,
          selectedIds: nextSelected,
        };
      }

      const firstTile = current.tiles.find((tile) => tile.tileId === nextSelected[0]) || null;
      const secondTile = current.tiles.find((tile) => tile.tileId === nextSelected[1]) || null;
      const isMatch =
        firstTile &&
        secondTile &&
        firstTile.flashcardId === secondTile.flashcardId &&
        firstTile.variant !== secondTile.variant;

      const nextLog = [...current.answerLog];
      if (firstTile) {
        nextLog.push({
          flashcardId: firstTile.flashcardId,
          seenCount: 1,
          correctCount: isMatch ? 1 : 0,
          incorrectCount: isMatch ? 0 : 1,
          eventType: "memory",
        });
      }
      if (secondTile) {
        nextLog.push({
          flashcardId: secondTile.flashcardId,
          seenCount: 1,
          correctCount: isMatch ? 1 : 0,
          incorrectCount: isMatch ? 0 : 1,
          eventType: "memory",
        });
      }

      const nextSolved = isMatch ? [...current.solvedIds, ...nextSelected] : current.solvedIds;
      const nextState = {
        ...current,
        selectedIds: nextSelected,
        solvedIds: nextSolved,
        answerLog: nextLog,
        score: Math.max(0, current.score + (isMatch ? 140 : -12)),
        turns: current.turns + 1,
        lock: true,
      };

      window.setTimeout(() => {
        setActiveRun((latest) => {
          if (!latest || latest.mode !== FLASHCARD_GAME_MODES.MEMORY_GRID) return latest;
          const clearedState = {
            ...latest,
            selectedIds: [],
            lock: false,
          };
          if (clearedState.solvedIds.length >= clearedState.tiles.length && clearedState.tiles.length > 0) {
            void finishRun(clearedState);
          }
          return clearedState;
        });
      }, 550);

      return nextState;
    });
  }

  const studyCard = activeRun?.mode === FLASHCARD_GAME_MODES.STUDY ? cards[activeRun.order[activeRun.index]] : null;
  const speedRound = activeRun?.mode === FLASHCARD_GAME_MODES.SPEED_MATCH ? activeRun.round : null;
  const writingCard = activeRun?.mode === FLASHCARD_GAME_MODES.WRITING_SPRINT ? activeRun.queue[activeRun.index] : null;

  if (!cards.length) {
    return (
      <section className="rounded-[22px] border border-dashed border-border bg-surface-2 px-5 py-10 text-center text-sm text-muted">
        This deck does not have published flashcards yet.
      </section>
    );
  }

  return (
    <section className={`space-y-5 text-foreground ${embedded ? "" : "student-panel px-6 py-6 sm:px-7"}`}>
      <header className="space-y-4 rounded-[24px] border border-[rgba(16,52,116,0.08)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-muted">Flashcard Arcade</p>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">{deckState?.title || "Flashcards"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              {deckState?.description || "Choose a mode, build mastery, and convert flashcard practice into account XP."}
            </p>
          </div>
          <div className="rounded-full border border-[rgba(16,52,116,0.12)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#103474]">
            {deckState?.sourceLabel || "Arcade deck"}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Cards" value={deckStats.totalCards} />
          <StatCard label="Completion" value={`${deckStats.completionPercent}%`} />
          <StatCard label="Avg mastery" value={`${deckStats.averageMastery}%`} />
          <StatCard label="Level" value={`Lv ${currentLevel}`} />
        </div>

        <div className="h-3 w-full rounded-full bg-white">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
            style={{ width: `${deckStats.completionPercent}%` }}
          />
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {completionSummary ? (
        <section className="rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Round complete</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{completionSummary.modeLabel}</h2>
              <p className="mt-2 text-sm text-muted">
                Accuracy {completionSummary.accuracyPercent}% · Score {completionSummary.score} · +{completionSummary.xpEarned} XP
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Correct" value={completionSummary.correctAnswers} />
              <StatCard label="XP earned" value={`+${completionSummary.xpEarned}`} />
              <StatCard label="Combo" value={completionSummary.comboMax || 0} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => beginMode(completionSummary.mode)}
              disabled={Boolean(loadingMode)}
              className="student-button-primary px-4 py-3 text-sm disabled:opacity-60"
            >
              Play again
            </button>
            <button
              type="button"
              onClick={() => setCompletionSummary(null)}
              className="student-button-secondary px-4 py-3 text-sm"
            >
              Switch mode
            </button>
            {onExit ? (
              <button
                type="button"
                onClick={() => onExit(deckState)}
                className="student-button-secondary px-4 py-3 text-sm"
              >
                Back
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!activeRun ? (
        <div className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-2">
            <ModeCard
              title="Study Mode"
              description="Flip, shuffle, listen, and move through the full deck with a cleaner mastery view."
              actionLabel={loadingMode === FLASHCARD_GAME_MODES.STUDY ? "Loading..." : "Open study mode"}
              onClick={() => beginMode(FLASHCARD_GAME_MODES.STUDY)}
              disabled={Boolean(loadingMode)}
              tone="bg-[linear-gradient(180deg,#ffffff_0%,#f6fbff_100%)]"
            />
            <ModeCard
              title="Speed Match"
              description="Fast prompt rounds with image, meaning, or audio cues under pressure."
              actionLabel={loadingMode === FLASHCARD_GAME_MODES.SPEED_MATCH ? "Loading..." : "Start speed round"}
              onClick={() => beginMode(FLASHCARD_GAME_MODES.SPEED_MATCH)}
              disabled={Boolean(loadingMode)}
              tone="bg-[linear-gradient(180deg,#ffffff_0%,#fff7f8_100%)]"
            />
            <ModeCard
              title="Writing Sprint"
              description="Type the right word from meaning or image prompts. Accepted answers still count."
              actionLabel={loadingMode === FLASHCARD_GAME_MODES.WRITING_SPRINT ? "Loading..." : "Start sprint"}
              onClick={() => beginMode(FLASHCARD_GAME_MODES.WRITING_SPRINT)}
              disabled={Boolean(loadingMode)}
              tone="bg-[linear-gradient(180deg,#ffffff_0%,#fffaf2_100%)]"
            />
            <ModeCard
              title="Memory Grid"
              description="Clear a lightweight board by matching word and meaning pairs."
              actionLabel={loadingMode === FLASHCARD_GAME_MODES.MEMORY_GRID ? "Loading..." : "Open grid"}
              onClick={() => beginMode(FLASHCARD_GAME_MODES.MEMORY_GRID)}
              disabled={Boolean(loadingMode)}
              tone="bg-[linear-gradient(180deg,#ffffff_0%,#f7fffb_100%)]"
            />
            <ModeCard
              title="Survival Mode"
              description="Three lives, escalating pace, and a tighter pressure loop are scaffolded for the next phase."
              actionLabel="Coming soon"
              onClick={() => {}}
              disabled
              tone="bg-[linear-gradient(180deg,#ffffff_0%,#f8f8ff_100%)] lg:col-span-2"
            />
          </section>

          <section className="rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted">Deck mastery</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">Your strongest and weakest cards</h2>
              </div>
              {onExit ? (
                <button type="button" onClick={() => onExit(deckState)} className="student-button-secondary px-4 py-3 text-sm">
                  Back
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {cards.slice(0, 6).map((card) => (
                <div key={card.id} className="rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-[#fbfdff] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{card.word}</p>
                      <p className="text-sm text-muted">{card.meaning}</p>
                    </div>
                    <span className="rounded-full border border-[rgba(16,52,116,0.12)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#103474]">
                      {formatStage(card.progress?.masteryStage)}
                    </span>
                  </div>
                  <div className="mt-3 h-2.5 w-full rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                      style={{ width: `${Math.max(0, Math.min(100, Number(card.progress?.masteryScore || 0) || 0))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeRun?.mode === FLASHCARD_GAME_MODES.STUDY && studyCard ? (
        <section className="space-y-4 rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">
              {activeRun.index + 1} / {cards.length}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleStudyShuffle}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${activeRun.shuffled ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary hover:bg-surface"}`}
              >
                <ShuffleIcon />
                {activeRun.shuffled ? "Shuffle on" : "Shuffle"}
              </button>
              <button
                type="button"
                onClick={() => void finishRun(activeRun)}
                disabled={savingSummary}
                className="student-button-primary px-4 py-3 text-sm disabled:opacity-60"
              >
                {savingSummary ? "Saving..." : "Finish deck"}
              </button>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={handleStudyFlip}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              handleStudyFlip();
            }}
            className="group relative block w-full rounded-[28px] border border-border bg-surface p-4 text-left shadow-sm"
          >
            <div className="relative h-[20rem] sm:h-[24rem]" style={{ perspective: "1200px" }}>
              <div
                className="relative h-full w-full transition-transform duration-500"
                style={{
                  transformStyle: "preserve-3d",
                  transform: activeRun.flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                <div
                  className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[1.5rem] border border-border bg-surface-2 p-4"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={studyCard.image}
                    alt={studyCard.word || "Flashcard image"}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div
                  className="absolute inset-0 flex flex-col justify-center rounded-[1.5rem] border border-primary/20 bg-primary/5 px-6 py-6 text-center"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void playCardAudio(studyCard);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                      >
                        <SpeakerIcon />
                        Listen
                      </button>
                    </div>
                    <p className="text-3xl font-semibold text-foreground">{studyCard.word}</p>
                    <p className="text-lg text-muted">{studyCard.meaning}</p>
                    {ttsMessage ? <p className="text-xs text-muted">{ttsMessage}</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goToStudyIndex(activeRun.index - 1)}
              disabled={activeRun.index <= 0}
              className="student-button-secondary px-4 py-3 text-sm disabled:opacity-60"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToStudyIndex(activeRun.index + 1)}
              disabled={activeRun.index >= activeRun.order.length - 1}
              className="student-button-secondary px-4 py-3 text-sm disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </section>
      ) : null}

      {activeRun?.mode === FLASHCARD_GAME_MODES.SPEED_MATCH && speedRound ? (
        <section className="space-y-5 rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Time" value={`${activeRun.timeLeft}s`} />
            <StatCard label="Score" value={activeRun.score} />
            <StatCard label="Combo" value={activeRun.combo} />
            <StatCard label="Round" value={`${activeRun.roundIndex + 1}/${activeRun.queue.length}`} />
          </div>

          <div className="rounded-[24px] border border-[rgba(16,52,116,0.08)] bg-[#fbfdff] px-5 py-6 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Prompt</p>
            {speedRound.promptType === "image" ? (
              <div className="mx-auto mt-4 h-48 max-w-sm overflow-hidden rounded-[22px] border border-border bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={speedRound.promptCard.image} alt={speedRound.promptCard.word} className="h-full w-full object-contain" />
              </div>
            ) : speedRound.promptType === "audio" ? (
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => void playCardAudio(speedRound.promptCard)}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary"
                >
                  <SpeakerIcon />
                  Replay audio
                </button>
                <p className="text-sm text-muted">Choose the correct word from the audio cue.</p>
              </div>
            ) : (
              <p className="mt-5 text-3xl font-semibold text-foreground">{speedRound.promptCard.meaning}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {speedRound.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSpeedAnswer(option.id)}
                className="rounded-[18px] border border-[rgba(16,52,116,0.12)] bg-white px-4 py-4 text-left text-base font-semibold text-foreground transition hover:border-primary hover:bg-[#f8fbff]"
              >
                {option.word}
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void finishRun(activeRun, { completed: false, silent: true })}
              className="student-button-secondary px-4 py-3 text-sm"
            >
              Leave round
            </button>
          </div>
        </section>
      ) : null}

      {activeRun?.mode === FLASHCARD_GAME_MODES.WRITING_SPRINT && writingCard ? (
        <section className="space-y-5 rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Time" value={`${activeRun.timeLeft}s`} />
            <StatCard label="Score" value={activeRun.score} />
            <StatCard label="Solved" value={`${activeRun.index}/${activeRun.queue.length}`} />
            <StatCard label="Accepted" value={getAcceptedAnswers(writingCard).length} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div className="overflow-hidden rounded-[24px] border border-border bg-surface-2 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={writingCard.image} alt={writingCard.word} className="h-[18rem] w-full object-contain" />
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-muted">Meaning</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{writingCard.meaning}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void playCardAudio(writingCard)}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
                >
                  <SpeakerIcon />
                  Listen
                </button>
              </div>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Type the word</span>
                <input
                  value={activeRun.input}
                  onChange={(event) =>
                    setActiveRun((current) =>
                      current && current.mode === FLASHCARD_GAME_MODES.WRITING_SPRINT
                        ? { ...current, input: event.target.value, feedback: "" }
                        : current
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    handleWritingSubmit();
                  }}
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-sm text-foreground"
                  placeholder="Write the correct word"
                />
              </label>
              {activeRun.feedback ? (
                <p className="text-sm text-muted">{activeRun.feedback}</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleWritingSubmit} className="student-button-primary px-4 py-3 text-sm">
                  Submit
                </button>
                <button
                  type="button"
                  onClick={() => void finishRun(activeRun, { completed: false, silent: true })}
                  className="student-button-secondary px-4 py-3 text-sm"
                >
                  Leave round
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeRun?.mode === FLASHCARD_GAME_MODES.MEMORY_GRID ? (
        <section className="space-y-5 rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Score" value={activeRun.score} />
            <StatCard label="Turns" value={activeRun.turns} />
            <StatCard label="Pairs" value={`${Math.floor(activeRun.solvedIds.length / 2)}/${Math.floor(activeRun.tiles.length / 2)}`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {activeRun.tiles.map((tile) => {
              const flipped = activeRun.selectedIds.includes(tile.tileId) || activeRun.solvedIds.includes(tile.tileId);
              return (
                <button
                  key={tile.tileId}
                  type="button"
                  onClick={() => handleMemoryTile(tile.tileId)}
                  className={`min-h-28 rounded-[18px] border px-3 py-4 text-sm font-semibold transition ${flipped ? "border-primary/30 bg-primary/10 text-foreground" : "border-[rgba(16,52,116,0.1)] bg-[#f8fbff] text-transparent hover:border-primary/20"}`}
                >
                  <span className={flipped ? "block text-foreground" : "block select-none"}>{flipped ? tile.label : "Arcade"}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void finishRun(activeRun, { completed: false, silent: true })}
              className="student-button-secondary px-4 py-3 text-sm"
            >
              Leave round
            </button>
          </div>
        </section>
      ) : null}

      {savingSummary ? (
        <div className="rounded-2xl border border-[rgba(16,52,116,0.12)] bg-white px-4 py-3 text-sm text-muted">
          Saving your flashcard session...
        </div>
      ) : null}
    </section>
  );
}
