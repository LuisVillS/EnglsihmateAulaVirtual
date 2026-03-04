"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitLessonQuizStep } from "../actions";
import LessonQuizPlayer from "./lesson-quiz-player";

const MAX_BACKGROUND_SAVE_RETRIES = 3;
const BACKGROUND_SAVE_RETRY_DELAYS_MS = [1000, 2200, 4500];

function getQueueStorageKey(lessonId) {
  return `lesson-quiz-save-queue:${String(lessonId || "").trim()}`;
}

function readQueuedSaves(lessonId) {
  if (typeof window === "undefined") return [];
  const key = getQueueStorageKey(lessonId);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueuedSaves(lessonId, queue) {
  if (typeof window === "undefined") return;
  const key = getQueueStorageKey(lessonId);
  if (!Array.isArray(queue) || queue.length <= 0) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(queue));
}

function buildRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildBackgroundSaveFormData(entry) {
  const formData = new FormData();
  formData.append("lessonId", String(entry.lessonId || "").trim());
  formData.append("currentIndex", String(Number(entry.currentIndex) || 0));
  formData.append("totalExercises", String(Number(entry.totalExercises) || 0));
  formData.append("pageResults", JSON.stringify(Array.isArray(entry.pageResults) ? entry.pageResults : []));
  formData.append("responseMode", "background");
  formData.append("requestKey", String(entry.requestKey || ""));
  return formData;
}

export default function LessonQuizPagePlayer({
  lessonId,
  totalExercises = 0,
  pageStartIndex = 0,
  pageEntries = [],
  exercisePointValues = [],
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const playerRefs = useRef([]);
  const isFlushingQueueRef = useRef(false);
  const flushTimeoutRef = useRef(0);

  function setPlayerRef(index, node) {
    playerRefs.current[index] = node;
  }

  const flushQueuedSaves = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isFlushingQueueRef.current) return;

    isFlushingQueueRef.current = true;
    try {
      const pending = readQueuedSaves(lessonId);
      if (!pending.length) return;

      const now = Date.now();
      const nextQueue = [];
      for (const item of pending) {
        const nextTryAt = Number(item?.nextTryAt || 0);
        if (nextTryAt > now) {
          nextQueue.push(item);
          continue;
        }

        try {
          await submitLessonQuizStep(buildBackgroundSaveFormData(item));
        } catch {
          const nextAttempt = Number(item?.retryCount || 0) + 1;
          if (nextAttempt < MAX_BACKGROUND_SAVE_RETRIES) {
            const retryDelay = BACKGROUND_SAVE_RETRY_DELAYS_MS[nextAttempt - 1] || 5000;
            nextQueue.push({
              ...item,
              retryCount: nextAttempt,
              nextTryAt: Date.now() + retryDelay,
            });
          }
        }
      }

      writeQueuedSaves(lessonId, nextQueue);
      if (nextQueue.length) {
        const nextDelay = Math.max(
          200,
          nextQueue.reduce((minDelay, item) => {
            const wait = Math.max(0, Number(item?.nextTryAt || 0) - Date.now());
            return Math.min(minDelay, wait);
          }, Number.POSITIVE_INFINITY)
        );
        if (flushTimeoutRef.current) {
          window.clearTimeout(flushTimeoutRef.current);
        }
        flushTimeoutRef.current = window.setTimeout(() => {
          void flushQueuedSaves();
        }, nextDelay);
      }
    } finally {
      isFlushingQueueRef.current = false;
    }
  }, [lessonId]);

  const enqueueBackgroundSave = useCallback((payload) => {
    const queue = readQueuedSaves(lessonId);
    queue.push(payload);
    writeQueuedSaves(lessonId, queue);
  }, [lessonId]);

  useEffect(() => {
    void flushQueuedSaves();
    const handleOnline = () => {
      void flushQueuedSaves();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void flushQueuedSaves();
      }
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (flushTimeoutRef.current) {
        window.clearTimeout(flushTimeoutRef.current);
      }
    };
  }, [flushQueuedSaves]);

  function handlePageSubmit(event) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const results = [];
    for (let index = 0; index < pageEntries.length; index += 1) {
      const api = playerRefs.current[index];
      const result = api?.evaluateAndGetSubmission?.() || null;
      if (!result?.exerciseId) {
        return;
      }
      results.push(result);
    }

    if (!results.length) {
      return;
    }

    const highestExerciseIndex = results.reduce(
      (maxValue, result) => Math.max(maxValue, Number(result?.exerciseIndex) || 0),
      Math.max(0, Number(pageStartIndex) || 0)
    );
    const nextIndex = highestExerciseIndex + 1;
    const isCompleted = nextIndex >= totalExercises;
    const safeNextIndex = Math.max(0, Math.min(totalExercises - 1, nextIndex));

    enqueueBackgroundSave({
      lessonId,
      currentIndex: pageStartIndex,
      totalExercises,
      pageResults: results,
      requestKey: buildRequestKey(),
      retryCount: 0,
      nextTryAt: 0,
      queuedAt: Date.now(),
    });
    void flushQueuedSaves();
    setIsSubmitting(true);
    startTransition(() => {
      router.push(
        isCompleted
          ? `/app/clases/${lessonId}/prueba/resultados`
          : `/app/clases/${lessonId}/prueba/jugar?i=${safeNextIndex}`
      );
    });
  }

  return (
    <div className="space-y-5">
      {pageEntries.map((entry, entryIndex) => (
        <section
          key={`quiz-page-entry-${entry.globalIndex}`}
          className={entryIndex < pageEntries.length - 1 ? "border-b border-border/70 pb-4 sm:pb-5" : "pb-1"}
        >
          <div className="space-y-1.5">
            {entry.showSkillHeader ? (
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                {entry.skillLabel}
              </h2>
            ) : null}
            {entry.showTypeHeader ? (
              <p className="text-lg font-bold uppercase tracking-[0.16em] text-foreground pb-4">
                {entry.typeLabel}
              </p>
            ) : null}
            <p className="text-base font-semibold text-muted sm:text-lg">
              {entry.skillNumber}.
            </p>
          </div>

          <div className="mt-2">
            <LessonQuizPlayer
              ref={(node) => setPlayerRef(entryIndex, node)}
              lessonId={lessonId}
              currentIndex={entry.globalIndex}
              totalExercises={totalExercises}
              exercise={entry.exercise}
              exercisePointValues={exercisePointValues}
              showSubmitButton={false}
              showTypeHeading={false}
            />
          </div>
        </section>
      ))}

      <form onSubmit={handlePageSubmit} className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3.5 text-lg font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Continuando..." : "Continuar"}
        </button>
        <p className="mt-2 text-center text-xs font-medium text-muted">Guardado automatico en segundo plano.</p>
      </form>
    </div>
  );
}
