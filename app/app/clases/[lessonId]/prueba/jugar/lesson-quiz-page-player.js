"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LessonQuizPlayer from "./lesson-quiz-player";
import { submitLessonQuizStep } from "../actions";

const MAX_BACKGROUND_SAVE_RETRIES = 3;
const BACKGROUND_SAVE_RETRY_DELAYS_MS = [1000, 2200, 4500];
const SELF_REVIEW_GROUP_TYPES = new Set();

function round2(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function computeDisplayExerciseScore(totalExercises, globalIndex, pointValues = []) {
  const total = Math.max(1, Number(totalExercises) || 1);
  const index = Math.max(0, Number(globalIndex) || 0);
  const points = Array.isArray(pointValues)
    ? pointValues.slice(0, total).map((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    })
    : [];
  const hasCustom = points.length === total && points.some((value) => value > 0);
  if (!hasCustom) {
    const base = round2(100 / total);
    if (index < total - 1) return base;
    return round2(100 - (base * (total - 1)));
  }
  const sum = points.reduce((acc, value) => acc + value, 0);
  if (!Number.isFinite(sum) || sum <= 0) return 0;
  return round2((points[index] / sum) * 100);
}

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

function buildFinalizeFormData(entry) {
  const formData = new FormData();
  formData.append("lessonId", String(entry.lessonId || "").trim());
  formData.append("currentIndex", String(Number(entry.currentIndex) || 0));
  formData.append("totalExercises", String(Number(entry.totalExercises) || 0));
  formData.append("pageResults", JSON.stringify(Array.isArray(entry.pageResults) ? entry.pageResults : []));
  formData.append("responseMode", "json");
  formData.append("finalizeAttempt", "1");
  formData.append("requestKey", String(entry.requestKey || ""));
  return formData;
}

function createResultHash(results = []) {
  return JSON.stringify(
    (Array.isArray(results) ? results : []).map((result) => ({
      exerciseId: String(result?.exerciseId || "").trim(),
      exerciseIndex: Number(result?.exerciseIndex || 0),
      finalStatus: String(result?.finalStatus || "").trim().toLowerCase(),
      scoreAwarded: Number(result?.scoreAwarded || 0),
      answerSnapshot: result?.answerSnapshot || null,
    }))
  );
}

function createDraftPageState() {
  return {
    status: "draft",
    results: [],
    isComplete: false,
    checkedAt: null,
  };
}

function normalizeGroupResults(group, results = []) {
  const orderedEntries = Array.isArray(group?.entries) ? group.entries : [];
  const resultByExerciseIndex = new Map(
    (Array.isArray(results) ? results : [])
      .filter(Boolean)
      .map((result) => [Number(result?.exerciseIndex ?? -1), result])
  );
  return orderedEntries
    .map((entry) => resultByExerciseIndex.get(Number(entry?.globalIndex ?? -1)) || null)
    .filter(Boolean);
}

export default function LessonQuizPagePlayer({
  lessonId,
  totalExercises = 0,
  pageGroups = [],
  initialPageGroupIndex = 0,
  exercisePointValues = [],
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPageGroupIndex, setCurrentPageGroupIndex] = useState(() =>
    Math.max(0, Math.min(Math.max(0, pageGroups.length - 1), Number(initialPageGroupIndex) || 0))
  );
  const [pageStates, setPageStates] = useState({});
  const pageStatesRef = useRef(pageStates);
  const playerRefs = useRef(new Map());
  const isFlushingQueueRef = useRef(false);
  const flushTimeoutRef = useRef(0);
  const persistedHashesRef = useRef(new Map());

  useEffect(() => {
    pageStatesRef.current = pageStates;
  }, [pageStates]);

  useEffect(() => {
    setCurrentPageGroupIndex(
      Math.max(0, Math.min(Math.max(0, pageGroups.length - 1), Number(initialPageGroupIndex) || 0))
    );
    setPageStates({});
    pageStatesRef.current = {};
    persistedHashesRef.current = new Map();
    setIsSubmitting(false);
    playerRefs.current = new Map();
  }, [lessonId, initialPageGroupIndex, pageGroups.length]);

  const groupById = useMemo(() => {
    const map = new Map();
    (Array.isArray(pageGroups) ? pageGroups : []).forEach((group) => {
      const key = String(group?.id || "").trim();
      if (key) map.set(key, group);
    });
    return map;
  }, [pageGroups]);

  function setPlayerRef(groupId, entryIndex, node) {
    const safeGroupId = String(groupId || "").trim();
    if (!safeGroupId) return;
    let groupMap = playerRefs.current.get(safeGroupId);
    if (!groupMap) {
      groupMap = new Map();
      playerRefs.current.set(safeGroupId, groupMap);
    }
    if (node) groupMap.set(entryIndex, node);
    else groupMap.delete(entryIndex);
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

  function persistGroupResults(group, results = []) {
    if (!group || !Array.isArray(results) || !results.length) return;
    const startIndex = Math.max(0, Number(group?.startIndex || results[0]?.exerciseIndex || 0));
    enqueueBackgroundSave({
      lessonId,
      currentIndex: startIndex,
      totalExercises,
      pageResults: results,
      requestKey: buildRequestKey(),
      retryCount: 0,
      nextTryAt: 0,
      queuedAt: Date.now(),
    });
    void flushQueuedSaves();
  }

  function upsertReviewedGroup(group, nextResults = [], options = {}) {
    if (!group) return;
    const normalizedResults = normalizeGroupResults(group, nextResults);
    if (!normalizedResults.length) return;

    const groupId = String(group.id || "").trim();
    if (!groupId) return;

    setPageStates((previous) => ({
      ...previous,
      [groupId]: {
        status: "reviewed",
        results: normalizedResults,
        isComplete: true,
        checkedAt: Date.now(),
      },
    }));

    if (options.persist !== false) {
      const nextHash = createResultHash(normalizedResults);
      const previousHash = persistedHashesRef.current.get(groupId);
      if (nextHash !== previousHash) {
        persistedHashesRef.current.set(groupId, nextHash);
        persistGroupResults(group, normalizedResults);
      }
    }
  }

  function gatherGroupResults(group) {
    const safeGroupId = String(group?.id || "").trim();
    if (!safeGroupId) return [];
    const groupMap = playerRefs.current.get(safeGroupId);
    if (!groupMap) return [];

    const entries = Array.isArray(group?.entries) ? group.entries : [];
    const results = [];
    for (let index = 0; index < entries.length; index += 1) {
      const api = groupMap.get(index);
      const result = api?.evaluateAndGetSubmission?.() || null;
      if (!result?.exerciseId) {
        return [];
      }
      results.push(result);
    }
    return normalizeGroupResults(group, results);
  }

  function handlePlayerResolvedSubmission(groupId, entryIndex, submission) {
    const safeGroupId = String(groupId || "").trim();
    if (!safeGroupId || !submission?.exerciseId) return;
    const group = groupById.get(safeGroupId);
    if (!group || !SELF_REVIEW_GROUP_TYPES.has(String(group.type || "").trim().toLowerCase())) return;

    const expectedCount = Array.isArray(group?.entries) ? group.entries.length : 0;
    if (expectedCount <= 0) return;

    const currentState = pageStatesRef.current[safeGroupId] || createDraftPageState();
    const mergedByExerciseIndex = new Map(
      normalizeGroupResults(group, currentState.results).map((result) => [
        Number(result?.exerciseIndex ?? -1),
        result,
      ])
    );
    mergedByExerciseIndex.set(Number(submission.exerciseIndex ?? -1), submission);

    const orderedResults = normalizeGroupResults(group, Array.from(mergedByExerciseIndex.values()));
    if (orderedResults.length < expectedCount) {
      setPageStates((previous) => ({
        ...previous,
        [safeGroupId]: {
          status: "draft",
          results: orderedResults,
          isComplete: false,
          checkedAt: previous[safeGroupId]?.checkedAt || null,
        },
      }));
      return;
    }

    upsertReviewedGroup(group, orderedResults, { persist: true });
  }

  const safePageGroups = Array.isArray(pageGroups) ? pageGroups : [];
  const safeCurrentGroupIndex = Math.max(0, Math.min(Math.max(0, safePageGroups.length - 1), currentPageGroupIndex));
  const currentGroup = safePageGroups[safeCurrentGroupIndex] || null;
  const currentGroupId = String(currentGroup?.id || "").trim();
  const currentGroupState = currentGroupId ? (pageStates[currentGroupId] || createDraftPageState()) : createDraftPageState();
  const isCurrentReviewed = currentGroupState.status === "reviewed";
  const hasPreviousGroup = safeCurrentGroupIndex > 0;
  const isLastGroup = safeCurrentGroupIndex >= Math.max(0, safePageGroups.length - 1);

  function goToPreviousGroup() {
    if (isSubmitting) return;
    setCurrentPageGroupIndex((current) => Math.max(0, current - 1));
  }

  async function goToNextGroupOrFinish() {
    if (isSubmitting || !isCurrentReviewed) return;
    if (isLastGroup) {
      setIsSubmitting(true);
      try {
        const reviewedResults = normalizeGroupResults(currentGroup, currentGroupState.results);
        const resultsToFinalize = reviewedResults.length ? reviewedResults : gatherGroupResults(currentGroup);
        if (!Array.isArray(resultsToFinalize) || !resultsToFinalize.length) {
          setIsSubmitting(false);
          return;
        }
        await submitLessonQuizStep(
          buildFinalizeFormData({
            lessonId,
            currentIndex: Math.max(0, Number(currentGroup?.startIndex || resultsToFinalize[0]?.exerciseIndex || 0)),
            totalExercises,
            pageResults: resultsToFinalize,
            requestKey: buildRequestKey(),
          })
        );
        startTransition(() => {
          router.push(`/app/clases/${lessonId}/prueba/resultados`);
        });
      } catch {
        setIsSubmitting(false);
      }
      return;
    }
    setCurrentPageGroupIndex((current) => Math.min(safePageGroups.length - 1, current + 1));
  }

  function checkCurrentGroupAnswers() {
    if (isSubmitting || !currentGroup || isCurrentReviewed) return;
    const results = gatherGroupResults(currentGroup);
    if (!results.length) return;
    upsertReviewedGroup(currentGroup, results, { persist: true });
  }

  return (
    <div className="space-y-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
        Pagina {safeCurrentGroupIndex + 1} de {Math.max(1, safePageGroups.length)}
      </p>

      {safePageGroups.map((group, groupIndex) => {
        const isVisibleGroup = groupIndex === safeCurrentGroupIndex;
        const groupId = String(group?.id || "").trim();
        const entries = Array.isArray(group?.entries) ? group.entries : [];
        return (
          <div key={groupId || `group-${groupIndex}`} className={isVisibleGroup ? "" : "hidden"}>
            {entries.map((entry, entryIndex) => (
              <section
                key={`quiz-page-entry-${groupId}-${entry.globalIndex}`}
                className={entryIndex < entries.length - 1 ? "border-b border-border/70 pb-4 sm:pb-5" : "pb-1"}
              >
                <div className="flex items-start gap-3">
                  <p className="w-8 shrink-0 pt-0.5 text-base font-semibold text-muted sm:text-lg">
                    {entry.skillNumber}.
                  </p>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        {entry.showSkillHeader ? (
                          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                            {entry.skillLabel}
                          </h2>
                        ) : null}
                        {entry.showTypeHeader ? (
                          <p className="pb-2 text-lg font-bold uppercase tracking-[0.16em] text-foreground">
                            {entry.typeLabel}
                          </p>
                        ) : null}
                      </div>
                      <span className="mt-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
                        {computeDisplayExerciseScore(totalExercises, entry.globalIndex, exercisePointValues)}/100
                      </span>
                    </div>
                    <div className="mt-1">
                      <LessonQuizPlayer
                        ref={(node) => setPlayerRef(groupId, entryIndex, node)}
                        lessonId={lessonId}
                        currentIndex={entry.globalIndex}
                        totalExercises={totalExercises}
                        exercise={entry.exercise}
                        isActive={isVisibleGroup}
                        exercisePointValues={exercisePointValues}
                        showSubmitButton={false}
                        showTypeHeading={false}
                        onResolvedSubmissionChange={(submission) =>
                          handlePlayerResolvedSubmission(groupId, entryIndex, submission)
                        }
                      />
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        );
      })}

      <div className="pt-2">
        {!isCurrentReviewed ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {hasPreviousGroup ? (
              <button
                type="button"
                onClick={goToPreviousGroup}
                disabled={isSubmitting}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Previous page
              </button>
            ) : null}
            <button
              type="button"
              onClick={checkCurrentGroupAnswers}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Check answers
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {hasPreviousGroup ? (
              <button
                type="button"
                onClick={goToPreviousGroup}
                disabled={isSubmitting}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Previous page
              </button>
            ) : null}
            <button
              type="button"
              onClick={goToNextGroupOrFinish}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Continuando..." : isLastGroup ? "Finish test" : "Next page"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
