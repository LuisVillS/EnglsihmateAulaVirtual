"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ListeningPlaybackControl from "@/components/listening-playback-control";
import { splitClozeSentenceSegments } from "@/lib/cloze-blanks";
import { evaluateExerciseAnswer } from "@/lib/duolingo/evaluate";
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

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatTimer(value) {
  const safe = Math.max(0, Number(value || 0) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function SectionCard({ children }) {
  return <section className="student-panel px-5 py-5 sm:px-6">{children}</section>;
}

function Badge({ label, tone = "default" }) {
  const toneClass =
    tone === "accent"
      ? "border-[rgba(16,52,116,0.12)] bg-[rgba(16,52,116,0.08)] text-[#103474]"
      : tone === "danger"
      ? "border-danger/30 bg-danger/10 text-danger"
      : "border-border bg-surface-2 text-muted";
  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${toneClass}`}>
      {label}
    </span>
  );
}

function QuestionBlock({ question, questionId, questionAnswer, result, showResult, disabled, onPatch }) {
  const isCorrectQuestion = Boolean(result?.isCorrect);
  const wasAnswered = Boolean(result?.answered);

  return (
    <div
      className={`rounded-2xl border p-4 ${
        showResult
          ? isCorrectQuestion
            ? "border-success/30 bg-success/10"
            : "border-danger/30 bg-danger/10"
          : "border-border bg-surface-2"
      }`}
    >
      <p className="text-sm font-semibold text-foreground">{question.prompt}</p>

      {question.type === LISTENING_QUESTION_TYPES.MULTIPLE_CHOICE ? (
        <div className="mt-3 grid gap-2">
          {question.options.map((option, optionIndex) => {
            const selected = Number(questionAnswer.selected_index) === optionIndex;
            const correctOption = Number(question.correct_index) === optionIndex;
            return (
              <button
                key={`${questionId}-${optionIndex}`}
                type="button"
                className={`rounded-xl border px-3 py-2 text-left text-sm ${
                  showResult && correctOption
                    ? "border-success/30 bg-success/10"
                    : showResult && selected && !correctOption
                    ? "border-danger/30 bg-danger/10"
                    : selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-white"
                }`}
                disabled={disabled}
                onClick={() => onPatch({ selected_index: optionIndex })}
              >
                {option || `Option ${optionIndex + 1}`}
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === LISTENING_QUESTION_TYPES.WRITTEN ? (
        <input
          value={questionAnswer.text || ""}
          onChange={(event) => onPatch({ text: event.target.value })}
          disabled={disabled}
          className="mt-3 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
          placeholder="Write your answer"
        />
      ) : null}

      {question.type === LISTENING_QUESTION_TYPES.TRUE_FALSE ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {["True", "False"].map((label, optionIndex) => {
            const value = optionIndex === 0;
            const selected = questionAnswer.value === value;
            const correctOption = Boolean(question.correct_boolean) === value;
            return (
              <button
                key={`${questionId}-${label}`}
                type="button"
                className={`rounded-xl border px-3 py-2 text-left text-sm ${
                  showResult && correctOption
                    ? "border-success/30 bg-success/10"
                    : showResult && selected && !correctOption
                    ? "border-danger/30 bg-danger/10"
                    : selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-white"
                }`}
                disabled={disabled}
                onClick={() => onPatch({ value })}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {showResult && (!wasAnswered || !isCorrectQuestion) ? (
        <p className="mt-3 text-xs font-semibold text-danger">
          Correct answer: {getListeningQuestionCorrectAnswerText(question)}
        </p>
      ) : null}
    </div>
  );
}

function updateQuestionAnswer(setAnswer, questionId, nextPatch) {
  setAnswer((previous) => ({
    ...previous,
    questions: {
      ...(previous.questions || {}),
      [questionId]: nextPatch,
    },
  }));
}

function upsertResult(list, nextResult) {
  const key = String(nextResult?.exercise_id || "");
  return [...(Array.isArray(list) ? list : []).filter((entry) => String(entry?.exercise_id || "") !== key), nextResult];
}

export default function StudentPracticeSession({ session, gamification, onGamificationChange, onCompleted, onExit }) {
  const items = useMemo(() => session?.items || [], [session?.items]);
  const startedAtRef = useRef(Date.now());
  const completionRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState(1);
  const [answer, setAnswer] = useState({});
  const [feedback, setFeedback] = useState("");
  const [isFinalized, setIsFinalized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [results, setResults] = useState([]);
  const [pairsState, setPairsState] = useState({ cards: [], selected: [], matched: [] });
  const [listeningPlaybackState, setListeningPlaybackState] = useState({ isPlaying: false, playsUsed: 0, remainingPlays: 0, canPlay: false });
  const [remainingTimeSec, setRemainingTimeSec] = useState(Number(session?.time_limit_sec || 0) || 0);

  const current = items[index] || null;

  useEffect(() => {
    startedAtRef.current = Date.now();
    completionRef.current = false;
    setIndex(0);
    setAttempts(1);
    setAnswer({});
    setFeedback("");
    setIsFinalized(false);
    setSaving(false);
    setCompleting(false);
    setResults([]);
    setPairsState({ cards: [], selected: [], matched: [] });
    setRemainingTimeSec(Number(session?.time_limit_sec || 0) || 0);
  }, [session?.id, session?.time_limit_sec]);

  useEffect(() => {
    if (!current || current.type !== "pairs") {
      setPairsState({ cards: [], selected: [], matched: [] });
      return;
    }
    const cards = shuffle(
      normalizeArray(current.content_json?.pairs).flatMap((pair, pairIndex) => [
        { id: `${pairIndex}-native`, pairIndex, side: "native", text: pair.native || "" },
        { id: `${pairIndex}-target`, pairIndex, side: "target", text: pair.target || "" },
      ])
    );
    setPairsState({ cards, selected: [], matched: [] });
  }, [current]);

  useEffect(() => {
    const content = current?.content_json || {};
    if (!current || current.type !== "audio_match") {
      setListeningPlaybackState({ isPlaying: false, playsUsed: 0, remainingPlays: 0, canPlay: false });
      return;
    }
    setListeningPlaybackState({
      isPlaying: false,
      playsUsed: 0,
      remainingPlays: getListeningMaxPlays(content, 1),
      canPlay: Boolean(content.youtube_url || content.audio_url),
    });
  }, [current]);

  const finishSession = useCallback(async ({ timedOut = false } = {}) => {
    if (!session?.id || completionRef.current) return;
    completionRef.current = true;
    setCompleting(true);
    setFeedback(timedOut ? "Time is over. Preparing your summary..." : "Preparing your summary...");

    const timeSpentSec = session?.time_limit_sec
      ? Math.max(0, Number(session.time_limit_sec || 0) - Number(remainingTimeSec || 0))
      : Math.round((Date.now() - startedAtRef.current) / 1000);

    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practice_session_id: session.id,
          mode: session.mode,
          complete_session: true,
          time_spent_sec: timeSpentSec,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "No se pudo completar la sesion.");

      if (data?.gamification) onGamificationChange?.(data.gamification);

      const correctItems = results.filter((entry) => entry.is_correct).length;
      const accuracyPercent = items.length ? Math.round((correctItems / items.length) * 100) : 0;
      const xpEarned = results.reduce((sum, entry) => sum + Math.max(0, Number(entry.xp_gain || 0) || 0), 0) + Math.max(0, Number(data?.session?.xpBonus || 0) || 0);

      onCompleted?.({
        mode: session.mode,
        request: session.request,
        items,
        results,
        totalItems: items.length,
        correctItems,
        accuracyPercent,
        xpEarned,
        recommendedNextMode: data?.session?.recommendedNextMode || "quick",
        competition: data?.competition || null,
        timedOut,
      });
    } catch (error) {
      completionRef.current = false;
      setFeedback(error.message || "No se pudo completar la sesion.");
      setCompleting(false);
    }
  }, [items, onCompleted, onGamificationChange, remainingTimeSec, results, session]);

  useEffect(() => {
    if (!session?.time_limit_sec || completing) return undefined;
    if (remainingTimeSec <= 0) {
      finishSession({ timedOut: true });
      return undefined;
    }
    const timerId = window.setInterval(() => {
      setRemainingTimeSec((currentSeconds) => Math.max(0, currentSeconds - 1));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [completing, finishSession, remainingTimeSec, session?.time_limit_sec]);

  const progressPercent = useMemo(() => (items.length ? Math.round((index / items.length) * 100) : 0), [index, items.length]);
  const content = current?.content_json || {};
  const questionAnswers = answer?.questions && typeof answer.questions === "object" ? answer.questions : {};
  const questions = current && ["audio_match", "reading_exercise"].includes(current.type) ? buildListeningQuestionsFromContent(content) : [];
  const questionSummary = questions.length ? summarizeListeningQuestionResults(questions, questionAnswers) : { results: [] };
  const questionResults = new Map(normalizeArray(questionSummary.results).map((row) => [String(row?.id || ""), row]));
  const clozeBlankKeys = normalizeArray(content.blanks).map((blank, blankIndex) => String(blank?.id || blank?.key || `blank_${blankIndex + 1}`));
  const clozeSegments = current?.type === "cloze" ? splitClozeSentenceSegments(content.sentence || "", clozeBlankKeys).segments : [];
  const clozeSelections = answer?.selected_by_blank && typeof answer.selected_by_blank === "object" ? answer.selected_by_blank : {};

  async function submitCurrentResult(isCorrect) {
    if (!current?.id || !session?.id) return null;
    setSaving(true);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practice_session_id: session.id,
          mode: session.mode,
          results: [{
            exercise_id: current.id,
            is_correct: isCorrect,
            attempts,
            practice_item_id: current.practice_item_id,
            practice_session_id: session.id,
            mode: session.mode,
            answer_snapshot: answer,
          }],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "No se pudo guardar progreso.");
      if (data?.gamification) onGamificationChange?.(data.gamification);
      return data?.results?.[0] || null;
    } finally {
      setSaving(false);
    }
  }

  async function finalizeAttempt(isCorrect) {
    const result = await submitCurrentResult(isCorrect);
    setResults((previous) => upsertResult(previous, {
      exercise_id: current.id,
      is_correct: isCorrect,
      xp_gain: Math.max(0, Number(result?.xp_gain || 0) || 0),
      source_reason: current.source_reason || current.mode || "practice",
      type: current.type,
    }));
    setFeedback(`${isCorrect ? "Correct" : "Incorrect"}${Number(result?.xp_gain || 0) ? ` · +${result.xp_gain} XP` : ""}`);
    setIsFinalized(true);
  }

  async function checkAnswer() {
    if (!current || isFinalized || saving || completing) return;
    if (current.type === "audio_match" && (content.youtube_url || content.audio_url) && listeningPlaybackState.playsUsed < 1) {
      setFeedback("Play the audio before answering.");
      return;
    }

    const isCorrect = evaluateExerciseAnswer({ type: current.type, content, answer });
    if (isCorrect) return finalizeAttempt(true);
    if (attempts < 3) {
      setAttempts((currentAttempts) => currentAttempts + 1);
      setFeedback(`Incorrect. Attempt ${attempts + 1} of 3.`);
      return;
    }
    return finalizeAttempt(false);
  }

  function nextItem() {
    if (index + 1 >= items.length) {
      finishSession();
      return;
    }
    setIndex((currentIndex) => currentIndex + 1);
    setAttempts(1);
    setAnswer({});
    setFeedback("");
    setIsFinalized(false);
  }

  if (!current) {
    return <SectionCard><p className="text-sm text-muted">This practice session has no items.</p></SectionCard>;
  }

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={session.label || "Practice"} tone="accent" />
              <Badge label={String(current.source_reason || current.mode || "practice").replace(/_/g, " ")} />
              {session?.time_limit_sec ? <Badge label={formatTimer(remainingTimeSec)} tone={remainingTimeSec <= 30 ? "danger" : "accent"} /> : null}
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-foreground">{current.type.replace(/_/g, " ")}</h2>
            <p className="mt-2 text-sm text-muted">Item {index + 1} of {items.length} · Level {Number(gamification?.level || 1)} · {Number(gamification?.lifetimeXp || 0)} XP</p>
          </div>
          <button type="button" onClick={onExit} disabled={completing} className="student-button-secondary px-4 py-2.5 text-sm disabled:opacity-60">Leave session</button>
        </div>
        <div className="mt-5 h-3 w-full rounded-full bg-surface-2"><div className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent" style={{ width: `${progressPercent}%` }} /></div>
      </SectionCard>

      <SectionCard>
        {current.type === "scramble" ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold text-foreground">{content.prompt_native}</p>
            <div className="rounded-2xl border border-border bg-surface-2 p-4">
              <div className="flex min-h-10 flex-wrap gap-2">
                {normalizeArray(answer.selected_order).map((wordIndex) => (
                  <button key={wordIndex} type="button" className="rounded-full border border-border bg-white px-3 py-1.5 text-sm" onClick={() => setAnswer((previous) => ({ ...previous, selected_order: normalizeArray(previous.selected_order).filter((value) => value !== wordIndex) }))}>{normalizeArray(content.target_words)[wordIndex]}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {normalizeArray(content.target_words).map((word, wordIndex) => normalizeArray(answer.selected_order).includes(wordIndex) ? null : (
                <button key={wordIndex} type="button" className="rounded-full border border-border bg-white px-3 py-1.5 text-sm" onClick={() => setAnswer((previous) => ({ ...previous, selected_order: [...normalizeArray(previous.selected_order), wordIndex] }))}>{word}</button>
              ))}
            </div>
          </div>
        ) : null}

        {current.type === "audio_match" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">{getListeningPrompt(content)}</p>
            <ListeningPlaybackControl
              key={`practice-listening-${current.id}`}
              youtubeUrl={content.youtube_url || ""}
              audioUrl={content.audio_url || ""}
              maxPlays={getListeningMaxPlays(content, 1)}
              startTime={getListeningStartTime(content, 0)}
              endTime={getListeningEndTime(content, null)}
              onStatusChange={setListeningPlaybackState}
            />
            <div className="space-y-3">
              {questions.map((question, questionIndex) => {
                const questionId = String(question?.id || `q_${questionIndex + 1}`).trim();
                return (
                  <QuestionBlock
                    key={questionId}
                    question={question}
                    questionId={questionId}
                    questionAnswer={questionAnswers[questionId] || {}}
                    result={questionResults.get(questionId) || null}
                    showResult={isFinalized}
                    disabled={isFinalized || (content.youtube_url || content.audio_url) && listeningPlaybackState.playsUsed < 1}
                    onPatch={(patch) => updateQuestionAnswer(setAnswer, questionId, patch)}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {current.type === "reading_exercise" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface-2 p-4">
              <h3 className="text-xl font-semibold text-foreground">{content.title || "Reading Exercise"}</h3>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground">{content.text || ""}</div>
            </div>
            <div className="space-y-3">
              {questions.map((question, questionIndex) => {
                const questionId = String(question?.id || `q_${questionIndex + 1}`).trim();
                return (
                  <QuestionBlock
                    key={questionId}
                    question={question}
                    questionId={questionId}
                    questionAnswer={questionAnswers[questionId] || {}}
                    result={questionResults.get(questionId) || null}
                    showResult={isFinalized}
                    disabled={isFinalized}
                    onPatch={(patch) => updateQuestionAnswer(setAnswer, questionId, patch)}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {current.type === "image_match" ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold text-foreground">{content.question_native}</p>
            {content.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={content.image_url} alt="Image prompt" className="h-56 w-full rounded-2xl object-cover" />
            ) : null}
            <div className="grid gap-2">
              {normalizeArray(content.options).map((option, optionIndex) => (
                <button
                  key={optionIndex}
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${Number(answer.selected_index) === optionIndex ? "border-primary bg-primary/10" : "border-border bg-white"}`}
                  onClick={() => setAnswer({ selected_index: optionIndex, selected_vocab_id: option.vocab_id || null })}
                >
                  {option.label || `Option ${optionIndex + 1}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {current.type === "pairs" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {pairsState.cards.map((card) => {
              const isMatched = pairsState.matched.includes(card.pairIndex);
              const isSelected = pairsState.selected.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`rounded-xl border px-3 py-3 text-left text-sm ${isMatched ? "border-success/30 bg-success/10" : isSelected ? "border-primary bg-primary/10" : "border-border bg-white"}`}
                  onClick={() => {
                    if (isMatched || isSelected || isFinalized) return;
                    if (!pairsState.selected.length) return setPairsState((previous) => ({ ...previous, selected: [card.id] }));
                    const first = pairsState.cards.find((entry) => entry.id === pairsState.selected[0]);
                    if (!first) return setPairsState((previous) => ({ ...previous, selected: [card.id] }));
                    if (first.pairIndex === card.pairIndex && first.side !== card.side) {
                      const matched = [...pairsState.matched, card.pairIndex];
                      setPairsState((previous) => ({ ...previous, selected: [], matched }));
                      if (matched.length >= normalizeArray(content.pairs).length) {
                        setAnswer({ matched_pairs: matched.length });
                        finalizeAttempt(true);
                      }
                      return;
                    }
                    setPairsState((previous) => ({ ...previous, selected: [first.id, card.id] }));
                    window.setTimeout(() => setPairsState((previous) => ({ ...previous, selected: [] })), 500);
                  }}
                >
                  {card.text}
                </button>
              );
            })}
          </div>
        ) : null}

        {current.type === "cloze" ? (
          normalizeArray(content.blanks).length ? (
            <div className="space-y-4">
              <p className="text-lg font-semibold text-foreground">Fill in each blank.</p>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-2 p-4 text-sm leading-7 text-foreground">
                {clozeSegments.map((segment, segmentIndex) => segment.kind === "blank" ? (
                  <select
                    key={`${segment.key}-${segmentIndex}`}
                    value={clozeSelections[segment.key] || ""}
                    onChange={(event) =>
                      setAnswer((previous) => ({
                        ...previous,
                        selected_by_blank: {
                          ...(previous.selected_by_blank || {}),
                          [segment.key]: event.target.value,
                        },
                      }))
                    }
                    className="min-w-[140px] rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select</option>
                    {normalizeArray(content.options_pool).map((option, optionIndex) => (
                      <option key={`${segment.key}-option-${optionIndex}`} value={String(option?.id || option?.text || "")}>
                        {option?.text || `Option ${optionIndex + 1}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span key={`text-${segmentIndex}`}>{segment.value}</span>
                ))}
              </div>
            </div>
          ) : normalizeArray(content.options).length ? (
            <div className="grid gap-2">
              {content.options.map((option, optionIndex) => (
                <button key={optionIndex} type="button" className={`rounded-xl border px-3 py-2 text-left text-sm ${Number(answer.selected_index) === optionIndex ? "border-primary bg-primary/10" : "border-border bg-white"}`} onClick={() => setAnswer({ selected_index: optionIndex })}>{option}</button>
              ))}
            </div>
          ) : (
            <input value={answer.text || ""} onChange={(event) => setAnswer({ text: event.target.value })} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" placeholder="Complete the blank" />
          )
        ) : null}

        {feedback ? <p className={`mt-5 text-sm font-semibold ${feedback.startsWith("Correct") ? "text-success" : feedback.includes("Preparing") ? "text-muted" : "text-danger"}`}>{feedback}</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {!isFinalized ? (
            <>
              <button type="button" onClick={checkAnswer} disabled={saving || completing} className="student-button-primary px-4 py-3 text-sm disabled:opacity-60">{saving ? "Saving..." : "Check answer"}</button>
              <button type="button" onClick={() => finalizeAttempt(false)} disabled={saving || completing} className="student-button-secondary px-4 py-3 text-sm disabled:opacity-60">I don&apos;t know</button>
              <span className="text-xs text-muted">Attempt {attempts} of 3</span>
            </>
          ) : (
            <button type="button" onClick={nextItem} disabled={completing} className="student-button-primary px-4 py-3 text-sm disabled:opacity-60">{index + 1 >= items.length ? (completing ? "Finishing..." : "See summary") : "Continue"}</button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
