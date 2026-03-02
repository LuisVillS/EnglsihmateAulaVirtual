"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
      id: String(card?.id || `flashcard-${index + 1}`),
      flashcardId: String(card?.flashcardId || card?.flashcard_id || "").trim(),
      word: String(card?.word || "").trim(),
      meaning: String(card?.meaning || "").trim(),
      image: String(card?.image || "").trim(),
      audioUrl: String(card?.audioUrl || card?.audio_url || "").trim(),
      audioR2Key: String(card?.audioR2Key || card?.audio_r2_key || "").trim(),
      order: Number(card?.order || index + 1) || index + 1,
      acceptedAnswers: Array.isArray(card?.acceptedAnswers) ? card.acceptedAnswers : [],
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

function buildStudyOrder(cards = [], shuffled = false) {
  const indexes = cards.map((_, index) => index);
  return shuffled ? shuffleArray(indexes) : indexes;
}

function buildMatchState(cards = []) {
  const queue = shuffleArray(cards);
  return {
    queue,
    tiles: shuffleArray(
      queue.map((card) => ({
        id: card.id,
        word: card.word,
      }))
    ),
    completed: 0,
    feedback: null,
  };
}

function buildWriteState(cards = []) {
  const selectedCards = shuffleArray(cards).slice(0, 12);
  return {
    cards: selectedCards,
    inputs: selectedCards.reduce((acc, card) => {
      acc[card.id] = "";
      return acc;
    }, {}),
    solved: {},
    flipped: {},
    feedback: {},
  };
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

export default function CourseSessionFlashcardsViewer({
  title = "Flashcards",
  sessionTitle = "",
  flashcards = [],
}) {
  const cards = useMemo(() => normalizeCards(flashcards), [flashcards]);
  const [mode, setMode] = useState("study");
  const [studyShuffled, setStudyShuffled] = useState(false);
  const [studyOrder, setStudyOrder] = useState(() => buildStudyOrder(cards, false));
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyFlipped, setStudyFlipped] = useState(false);
  const [ttsMessage, setTtsMessage] = useState("");
  const [selectedGame, setSelectedGame] = useState("");
  const [matchState, setMatchState] = useState(() => buildMatchState(cards));
  const [writeState, setWriteState] = useState(() => buildWriteState(cards));
  const [draggedTileId, setDraggedTileId] = useState("");
  const [hoveredSolvedId, setHoveredSolvedId] = useState("");
  const audioRef = useRef(null);

  useEffect(() => {
    return () => {
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

  const currentStudyCard = cards[studyOrder[studyIndex]] || null;
  const studyTotal = cards.length;
  const matchCurrentCard = matchState.queue[matchState.completed] || null;
  const matchRemaining = Math.max(0, matchState.queue.length - matchState.completed);
  const writeCorrectCount = Object.keys(writeState.solved || {}).length;
  const ttsAvailable =
    typeof window !== "undefined" &&
    Boolean(window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== "undefined");

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

  function toggleShuffle() {
    const nextShuffled = !studyShuffled;
    setStudyShuffled(nextShuffled);
    setStudyOrder(buildStudyOrder(cards, nextShuffled));
    setStudyIndex(0);
    setStudyFlipped(false);
  }

  function goToStudyIndex(nextIndex) {
    if (!cards.length) return;
    const boundedIndex = Math.max(0, Math.min(nextIndex, studyOrder.length - 1));
    setStudyIndex(boundedIndex);
    setStudyFlipped(false);
  }

  function speakWordFallback(word, errorMessage = "Audio no disponible en tu navegador.") {
    if (!ttsAvailable || !word || typeof window === "undefined") {
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
          setTtsMessage("");
        };
        audio.onerror = () => {
          if (audioRef.current === audio) {
            audioRef.current = null;
          }
          speakWordFallback(word, "No se pudo reproducir el audio guardado.");
        };
        setTtsMessage("");
        await audio.play();
        return;
      } catch {
        speakWordFallback(word, "No se pudo reproducir el audio guardado.");
        return;
      }
    }

    speakWordFallback(word);
  }

  function resetMatchGame() {
    setDraggedTileId("");
    setMatchState(buildMatchState(cards));
  }

  function submitMatch(tileId) {
    if (!tileId) return;
    setMatchState((previous) => {
      const currentCard = previous.queue[previous.completed] || null;
      if (!currentCard) return previous;

      if (String(tileId) === String(currentCard.id)) {
        const nextCompleted = previous.completed + 1;
        return {
          ...previous,
          tiles: previous.tiles.filter((tile) => String(tile.id) !== String(tileId)),
          completed: nextCompleted,
          feedback: {
            type: "success",
            message: "Correcto. La palabra fue consumida.",
          },
        };
      }

      return {
        ...previous,
        feedback: {
          type: "error",
          message: "No coincide. Intenta otra vez.",
        },
      };
    });
    setDraggedTileId("");
  }

  function resetWriteGame() {
    setHoveredSolvedId("");
    setWriteState(buildWriteState(cards));
  }

  function updateWriteInput(cardId, value) {
    setWriteState((previous) => ({
      ...previous,
      inputs: {
        ...previous.inputs,
        [cardId]: value,
      },
      feedback: {
        ...previous.feedback,
        [cardId]: "",
      },
    }));
  }

  function submitWriteAnswer(cardId) {
    setWriteState((previous) => {
      const currentCard = previous.cards.find((card) => String(card.id) === String(cardId));
      if (!currentCard) return previous;

      const currentValue = previous.inputs[cardId] || "";
      if (matchesAnswer(currentCard, currentValue)) {
        return {
          ...previous,
          inputs: {
            ...previous.inputs,
            [cardId]: "",
          },
          solved: {
            ...previous.solved,
            [cardId]: true,
          },
          flipped: {
            ...previous.flipped,
            [cardId]: false,
          },
          feedback: {
            ...previous.feedback,
            [cardId]: "correct",
          },
        };
      }

      return {
        ...previous,
        feedback: {
          ...previous.feedback,
          [cardId]: "incorrect",
        },
      };
    });
  }

  if (!cards.length) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          {sessionTitle ? <p className="text-sm text-muted">{sessionTitle}</p> : null}
        </div>
        <div className="rounded-3xl border border-dashed border-border bg-surface-2 px-5 py-8 text-center text-sm text-muted">
          Este set aun no tiene flashcards publicadas.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-foreground">{title}</p>
          {sessionTitle ? <p className="text-sm text-muted">{sessionTitle}</p> : null}
        </div>
        <div className="inline-flex rounded-2xl border border-border bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setMode("study")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${mode === "study" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"}`}
          >
            Estudiar
          </button>
          <button
            type="button"
            onClick={() => setMode("evaluate")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${mode === "evaluate" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"}`}
          >
            Evaluar
          </button>
        </div>
      </div>

      {mode === "study" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              {studyIndex + 1} / {studyTotal}
            </p>
            <button
              type="button"
              onClick={toggleShuffle}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${studyShuffled ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary hover:bg-surface"}`}
            >
              <ShuffleIcon />
              {studyShuffled ? "Barajar activado" : "Barajar"}
            </button>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setStudyFlipped((previous) => !previous)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              setStudyFlipped((previous) => !previous);
            }}
            className="group relative block w-full rounded-3xl border border-border bg-surface p-4 text-left shadow-sm"
          >
            <div className="relative h-[20rem] sm:h-[26rem]" style={{ perspective: "1200px" }}>
              <div
                className="relative h-full w-full transition-transform duration-500"
                style={{
                  transformStyle: "preserve-3d",
                  transform: studyFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                <div
                  className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[1.5rem] border border-border bg-surface-2 p-4"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentStudyCard?.image}
                    alt={currentStudyCard?.word || "Flashcard image"}
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
                          playCardAudio(currentStudyCard);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                      >
                        <SpeakerIcon />
                        Escuchar
                      </button>
                    </div>
                    <p className="text-3xl font-semibold text-foreground">{currentStudyCard?.word}</p>
                    <p className="text-lg text-muted">{currentStudyCard?.meaning}</p>
                    {!ttsAvailable ? (
                      <p className="text-xs text-danger">Audio no disponible en tu navegador.</p>
                    ) : null}
                    {ttsMessage ? <p className="text-xs text-muted">{ttsMessage}</p> : null}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              {studyFlipped ? "Tap/click para volver a la imagen" : "Tap/click para revelar"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goToStudyIndex(studyIndex - 1)}
              disabled={studyIndex === 0}
              className="flex-1 rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => goToStudyIndex(studyIndex + 1)}
              disabled={studyIndex >= studyOrder.length - 1}
              className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Siguiente
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!selectedGame ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  resetMatchGame();
                  setSelectedGame("match");
                }}
                className="rounded-3xl border border-border bg-surface p-5 text-left transition hover:border-primary hover:bg-surface-2"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Juego 1</p>
                <p className="mt-2 text-xl font-semibold text-foreground">Match Word - Image</p>
                <p className="mt-2 text-sm text-muted">
                  Empareja la palabra correcta con la imagen actual usando drag & drop o tap.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  resetWriteGame();
                  setSelectedGame("write");
                }}
                className="rounded-3xl border border-border bg-surface p-5 text-left transition hover:border-primary hover:bg-surface-2"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Juego 2</p>
                <p className="mt-2 text-xl font-semibold text-foreground">Grid de respuestas</p>
                <p className="mt-2 text-sm text-muted">
                  Escribe la palabra, desbloquea la tarjeta y luego gira para ver el meaning.
                </p>
              </button>
            </div>
          ) : null}

          {selectedGame === "match" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGame("")}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Volver
                </button>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                  <span>Restantes: {matchRemaining}</span>
                  <button
                    type="button"
                    onClick={resetMatchGame}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Reiniciar
                  </button>
                </div>
              </div>

              {matchCurrentCard ? (
                <>
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => submitMatch(draggedTileId)}
                    className={`rounded-3xl border p-4 ${matchState.feedback?.type === "error" ? "border-danger/40 bg-danger/10" : matchState.feedback?.type === "success" ? "border-success/35 bg-success/10" : "border-border bg-surface-2"}`}
                  >
                    <div className="mx-auto flex max-w-xl items-center justify-center overflow-hidden rounded-[1.5rem] border border-border bg-surface p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={matchCurrentCard.image}
                        alt={matchCurrentCard.word}
                        className="h-[18rem] w-full object-contain sm:h-[22rem]"
                      />
                    </div>
                  </div>

                  {matchState.feedback?.message ? (
                    <p className={`text-sm font-medium ${matchState.feedback.type === "error" ? "text-danger" : "text-success"}`}>
                      {matchState.feedback.message}
                    </p>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {matchState.tiles.map((tile) => (
                      <button
                        key={tile.id}
                        type="button"
                        draggable
                        onClick={() => submitMatch(tile.id)}
                        onDragStart={() => setDraggedTileId(tile.id)}
                        className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                      >
                        {tile.word}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-3xl border border-success/35 bg-success/10 px-5 py-8 text-center">
                  <p className="text-xl font-semibold text-success">Completado</p>
                  <p className="mt-2 text-sm text-success">
                    Emparejaste todas las palabras con sus imagenes.
                  </p>
                  <button
                    type="button"
                    onClick={resetMatchGame}
                    className="mt-4 rounded-2xl border border-success/35 bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-2"
                  >
                    Jugar otra vez
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {selectedGame === "write" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGame("")}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Volver
                </button>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                  <span>
                    Correctas: {writeCorrectCount} / {writeState.cards.length}
                  </span>
                  <button
                    type="button"
                    onClick={resetWriteGame}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Reiniciar
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {writeState.cards.map((card) => {
                  const solved = Boolean(writeState.solved[card.id]);
                  const manuallyFlipped = Boolean(writeState.flipped[card.id]);
                  const showBack = solved && (manuallyFlipped || hoveredSolvedId === card.id);
                  const feedback = writeState.feedback[card.id] || "";

                  return (
                    <article
                      key={card.id}
                      onMouseEnter={() => {
                        if (solved) setHoveredSolvedId(card.id);
                      }}
                      onMouseLeave={() => {
                        if (hoveredSolvedId === card.id) setHoveredSolvedId("");
                      }}
                      className="rounded-3xl border border-border bg-surface p-3 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!solved) return;
                          setWriteState((previous) => ({
                            ...previous,
                            flipped: {
                              ...previous.flipped,
                              [card.id]: !previous.flipped[card.id],
                            },
                          }));
                        }}
                        className="relative block w-full overflow-hidden rounded-2xl border border-border bg-surface-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={card.image}
                          alt={card.word}
                          className={`aspect-[4/3] w-full object-contain p-3 transition ${showBack ? "opacity-0" : "opacity-100"}`}
                        />
                        {showBack ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary/10 px-4 text-center">
                            <p className="text-lg font-semibold text-foreground">{card.word}</p>
                            <p className="text-sm text-muted">{card.meaning}</p>
                          </div>
                        ) : null}
                      </button>

                      {!solved ? (
                        <div className="mt-3 space-y-2">
                          <input
                            value={writeState.inputs[card.id] || ""}
                            onChange={(event) => updateWriteInput(card.id, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                submitWriteAnswer(card.id);
                              }
                            }}
                            className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                            placeholder="Escribe la palabra"
                          />
                          <button
                            type="button"
                            onClick={() => submitWriteAnswer(card.id)}
                            className="w-full rounded-2xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                          >
                            Comprobar
                          </button>
                          {feedback === "incorrect" ? (
                            <p className="text-xs text-danger">No coincide. Puedes reintentar.</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.24em] text-success">
                          Correcta. Hover o tap para ver el meaning.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
