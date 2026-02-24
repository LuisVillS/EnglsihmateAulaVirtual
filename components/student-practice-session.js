"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { evaluateExerciseAnswer } from "@/lib/duolingo/evaluate";

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function SectionCard({ children }) {
  return <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">{children}</div>;
}

function normalizeArray(input) {
  return Array.isArray(input) ? input : [];
}

function ExerciseBadge({ mode }) {
  if (!mode) return null;
  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        mode === "review" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
      }`}
    >
      {mode}
    </span>
  );
}

export default function StudentPracticeSession() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [student, setStudent] = useState(null);
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState(1);
  const [answer, setAnswer] = useState({});
  const [feedback, setFeedback] = useState("");
  const [isFinalized, setIsFinalized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pairsState, setPairsState] = useState({ cards: [], selected: [], matched: [] });

  const items = session?.items || [];
  const current = items[index] || null;

  const progressPercent = useMemo(() => {
    if (!items.length) return 0;
    return Math.round((index / items.length) * 100);
  }, [items.length, index]);

  const sessionRequestUrl = useMemo(() => {
    const query = searchParams?.toString() || "";
    return query ? `/api/session?${query}` : "/api/session";
  }, [searchParams]);

  const fetchSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(sessionRequestUrl, { method: "GET", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cargar sesión.");
      }
      setSession(data.session);
      setStudent(data.student);
      setIndex(0);
      setAttempts(1);
      setAnswer({});
      setFeedback("");
      setIsFinalized(false);
    } catch (err) {
      setError(err.message || "No se pudo cargar sesión.");
    } finally {
      setLoading(false);
    }
  }, [sessionRequestUrl]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    if (!current || current.type !== "pairs") {
      setPairsState({ cards: [], selected: [], matched: [] });
      return;
    }
    const pairs = normalizeArray(current.content_json?.pairs);
    const cards = shuffle(
      pairs.flatMap((pair, idx) => [
        { id: `${idx}-native`, pairIndex: idx, side: "native", text: pair.native || "" },
        { id: `${idx}-target`, pairIndex: idx, side: "target", text: pair.target || "" },
      ])
    );
    setPairsState({ cards, selected: [], matched: [] });
  }, [current]);

  function nextExercise() {
    setFeedback("");
    setIsFinalized(false);
    setAttempts(1);
    setAnswer({});
    if (index + 1 >= items.length) {
      fetchSession();
      return;
    }
    setIndex((prev) => prev + 1);
  }

  async function submitProgress({ isCorrect, finalAttempts }) {
    if (!current?.id || !student?.student_code) return;
    setSaving(true);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_code: student.student_code,
          results: [
            {
              exercise_id: current.id,
              is_correct: isCorrect,
              attempts: finalAttempts,
            },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo guardar progreso.");
      }
      if (data?.student) {
        setStudent((prev) => ({
          ...(prev || {}),
          xp_total: data.student.xp_total,
          current_streak: data.student.current_streak,
        }));
      }
    } catch (err) {
      setError(err.message || "No se pudo guardar progreso.");
    } finally {
      setSaving(false);
    }
  }

  async function finalizeAttempt(isCorrect) {
    await submitProgress({ isCorrect, finalAttempts: attempts });
    setFeedback(isCorrect ? "Correcto" : "Incorrecto");
    setIsFinalized(true);
  }

  async function checkAnswer() {
    if (!current || isFinalized || saving) return;

    const isCorrect = evaluateExerciseAnswer({
      type: current.type,
      content: current.content_json || {},
      answer,
    });

    if (isCorrect) {
      await finalizeAttempt(true);
      return;
    }

    if (attempts < 3) {
      setAttempts((prev) => prev + 1);
      setFeedback(`Incorrecto. Intento ${attempts + 1} de 3.`);
      return;
    }

    await finalizeAttempt(false);
  }

  async function markAsIncorrect() {
    if (isFinalized || saving) return;
    await finalizeAttempt(false);
  }

  function onPairCardClick(card) {
    if (isFinalized || !current || current.type !== "pairs") return;
    if (pairsState.matched.includes(card.pairIndex)) return;
    if (pairsState.selected.includes(card.id)) return;

    if (!pairsState.selected.length) {
      setPairsState((prev) => ({ ...prev, selected: [card.id] }));
      return;
    }

    const firstId = pairsState.selected[0];
    const first = pairsState.cards.find((item) => item.id === firstId);
    if (!first) {
      setPairsState((prev) => ({ ...prev, selected: [card.id] }));
      return;
    }

    if (first.pairIndex === card.pairIndex && first.side !== card.side) {
      const matched = [...pairsState.matched, card.pairIndex];
      setPairsState((prev) => ({ ...prev, selected: [], matched }));
      const totalPairs = normalizeArray(current.content_json?.pairs).length;
      if (matched.length >= totalPairs) {
        setAnswer({ matched_pairs: matched.length });
        finalizeAttempt(true);
      }
      return;
    }

    setPairsState((prev) => ({ ...prev, selected: [first.id, card.id] }));
    window.setTimeout(() => {
      setPairsState((prev) => ({ ...prev, selected: [] }));
    }, 500);
  }

  if (loading) {
    return <SectionCard><p className="text-sm text-muted">Cargando sesion...</p></SectionCard>;
  }

  if (error) {
    return (
      <SectionCard>
        <p className="text-sm text-danger">{error}</p>
        <button type="button" onClick={fetchSession} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Reintentar
        </button>
      </SectionCard>
    );
  }

  if (!current) {
    return (
      <SectionCard>
        <p className="text-sm text-muted">No hay ejercicios disponibles por ahora.</p>
        <button type="button" onClick={fetchSession} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Recargar
        </button>
      </SectionCard>
    );
  }

  const content = current.content_json || {};
  const scrambleWords = normalizeArray(content.target_words);
  const selectedOrder = normalizeArray(answer.selected_order);
  const availableIndexes = scrambleWords.map((_, idx) => idx).filter((idx) => !selectedOrder.includes(idx));

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Practice Lab</p>
            <h2 className="text-2xl font-semibold">sesion inteligente</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">XP: {Number(student?.xp_total || 0)}</p>
            <p className="text-sm text-muted">Streak: {Number(student?.current_streak || 0)}</p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Ejercicio {index + 1} de {items.length}
        </p>
      </SectionCard>

      <SectionCard>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">{current.type}</p>
          <ExerciseBadge mode={current.mode} />
        </div>

        {current.type === "scramble" ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold">{content.prompt_native}</p>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tu oracion</p>
              <div className="flex min-h-10 flex-wrap gap-2">
                {selectedOrder.length ? (
                  selectedOrder.map((idx) => (
                    <button
                      key={`selected-${idx}`}
                      type="button"
                      className="rounded-full border border-border px-3 py-1 text-sm"
                      onClick={() =>
                        setAnswer((prev) => ({
                          ...prev,
                          selected_order: normalizeArray(prev.selected_order).filter((item) => item !== idx),
                        }))
                      }
                    >
                      {scrambleWords[idx]}
                    </button>
                  ))
                ) : (
                  <span className="text-sm text-muted">Selecciona palabras</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableIndexes.map((idx) => (
                <button
                  key={`available-${idx}`}
                  type="button"
                  className="rounded-full border border-border px-3 py-1 text-sm"
                  onClick={() =>
                    setAnswer((prev) => ({
                      ...prev,
                      selected_order: [...normalizeArray(prev.selected_order), idx],
                    }))
                  }
                >
                  {scrambleWords[idx]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {current.type === "audio_match" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">Escucha el audio y responde.</p>
            {content.audio_url ? <audio controls src={content.audio_url} className="w-full" /> : null}
            {content.mode === "translation" && normalizeArray(content.options).length ? (
              <div className="grid gap-2">
                {content.options.map((option, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${
                      Number(answer.selected_index) === idx ? "border-primary bg-primary/10" : "border-border"
                    }`}
                    onClick={() => setAnswer((prev) => ({ ...prev, selected_index: idx }))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={answer.text || ""}
                onChange={(event) => setAnswer((prev) => ({ ...prev, text: event.target.value }))}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
                placeholder="Escribe lo que escuchas"
              />
            )}
          </div>
        ) : null}

        {current.type === "image_match" ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold">{content.question_native}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {normalizeArray(content.options).map((option, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`rounded-xl border p-2 ${
                    Number(answer.selected_index) === idx ? "border-primary bg-primary/10" : "border-border"
                  }`}
                  onClick={() =>
                    setAnswer((prev) => ({
                      ...prev,
                      selected_index: idx,
                      selected_vocab_id: option.vocab_id || null,
                    }))
                  }
                >
                  {option.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.image_url} alt={`option-${idx}`} className="h-32 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-lg bg-background text-xs text-muted">
                      Sin imagen
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {current.type === "pairs" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">Empareja los pares correctos.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {pairsState.cards.map((card) => {
                const isMatched = pairsState.matched.includes(card.pairIndex);
                const isSelected = pairsState.selected.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => onPairCardClick(card)}
                    className={`rounded-xl border px-3 py-3 text-left text-sm ${
                      isMatched ? "border-success bg-success/10" : isSelected ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    {card.text}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              Aciertos: {pairsState.matched.length}/{normalizeArray(content.pairs).length}
            </p>
          </div>
        ) : null}

        {current.type === "cloze" ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold">{content.sentence}</p>
            {normalizeArray(content.options).length ? (
              <div className="grid gap-2">
                {content.options.map((option, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${
                      Number(answer.selected_index) === idx ? "border-primary bg-primary/10" : "border-border"
                    }`}
                    onClick={() => setAnswer((prev) => ({ ...prev, selected_index: idx }))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={answer.text || ""}
                onChange={(event) => setAnswer((prev) => ({ ...prev, text: event.target.value }))}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
                placeholder="Completa el espacio"
              />
            )}
          </div>
        ) : null}

        {feedback ? (
          <p className={`mt-4 text-sm font-semibold ${feedback === "Correcto" ? "text-success" : "text-danger"}`}>{feedback}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {!isFinalized ? (
            <>
              <button
                type="button"
                onClick={checkAnswer}
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {saving ? "Guardando..." : "Comprobar"}
              </button>
              <button
                type="button"
                onClick={markAsIncorrect}
                disabled={saving}
                className="rounded-xl border border-border px-4 py-2 text-sm"
              >
                No lo se
              </button>
              <span className="self-center text-xs text-muted">Intento {attempts} de 3</span>
            </>
          ) : (
            <button type="button" onClick={nextExercise} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Continuar
            </button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}




