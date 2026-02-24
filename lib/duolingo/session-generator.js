import {
  CONTENT_STATUSES,
  DEFAULT_NEW_ITEMS,
  DEFAULT_REVIEW_ITEMS,
  EXERCISE_TYPES,
  NEW_TYPE_PRIORITY,
  REVIEW_TYPE_PRIORITY,
  TYPE_BY_LEGACY_KIND,
} from "./constants.js";
import { normalizeExerciseType, parseContentJson } from "./validation.js";

function toTimestamp(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === CONTENT_STATUSES.PUBLISHED) return CONTENT_STATUSES.PUBLISHED;
  if (normalized === CONTENT_STATUSES.ARCHIVED) return CONTENT_STATUSES.ARCHIVED;
  return CONTENT_STATUSES.DRAFT;
}

function normalizeExercise(row) {
  const type = normalizeExerciseType(row?.type) || TYPE_BY_LEGACY_KIND[row?.kind] || EXERCISE_TYPES.CLOZE;
  return {
    id: row?.id,
    lesson_id: row?.lesson_id,
    type,
    status: normalizeStatus(row?.status),
    ordering: Number(row?.ordering || 0) || 0,
    updated_at: row?.updated_at || row?.created_at || null,
    content_json: parseContentJson(row?.content_json ?? row?.payload) || {},
    lesson: row?.lesson || null,
  };
}

function typeScore(type, priority) {
  const index = priority.indexOf(type);
  return index === -1 ? priority.length + 1 : index;
}

function sortByPriority(items, priority, { byDue = false } = {}) {
  return [...items].sort((left, right) => {
    const scoreDiff = typeScore(left.type, priority) - typeScore(right.type, priority);
    if (scoreDiff !== 0) return scoreDiff;

    if (byDue) {
      const leftDue = toTimestamp(left?.progress?.next_due_at);
      const rightDue = toTimestamp(right?.progress?.next_due_at);
      if (Number.isFinite(leftDue) && Number.isFinite(rightDue) && leftDue !== rightDue) {
        return leftDue - rightDue;
      }
    }

    const leftOrder = Number(left.ordering || 0);
    const rightOrder = Number(right.ordering || 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    const leftUpdated = toTimestamp(left.updated_at);
    const rightUpdated = toTimestamp(right.updated_at);
    if (Number.isFinite(leftUpdated) && Number.isFinite(rightUpdated) && leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated;
    }

    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

function selectItems(items, limit, priority, options = {}) {
  if (!items.length || limit <= 0) return [];
  return sortByPriority(items, priority, options).slice(0, limit);
}

function isDueForReview(progress, nowMs) {
  if (!progress) return false;
  if (progress.is_correct === false) return true;
  if (Number(progress.last_quality) <= 2) return true;

  const dueMs = toTimestamp(progress.next_due_at);
  return Number.isFinite(dueMs) && dueMs <= nowMs;
}

function mixSessionItems({ newItems, reviewItems, maxItems }) {
  const output = [];
  const newQueue = [...newItems];
  const reviewQueue = [...reviewItems];

  while (output.length < maxItems && (newQueue.length || reviewQueue.length)) {
    if (newQueue.length) {
      const item = newQueue.shift();
      if (item) output.push({ ...item, mode: "new" });
    }
    if (output.length >= maxItems) break;
    if (reviewQueue.length) {
      const item = reviewQueue.shift();
      if (item) output.push({ ...item, mode: "review" });
    }
  }

  return output.slice(0, maxItems);
}

function injectPairs({ selected, availablePairs }) {
  if (!availablePairs.length || !selected.length) {
    return selected;
  }

  const hasPairs = selected.some((item) => item.type === EXERCISE_TYPES.PAIRS);
  if (hasPairs) return selected;

  const pairItem = availablePairs[0];
  const insertAt = Math.min(4, selected.length - 1);
  const next = [...selected];
  next.splice(insertAt, 0, { ...pairItem, mode: "review" });
  if (next.length > selected.length) {
    next.pop();
  }
  return next;
}

export function buildSessionPlan({
  exercises,
  progressRows,
  now = new Date(),
  newCount = DEFAULT_NEW_ITEMS,
  reviewCount = DEFAULT_REVIEW_ITEMS,
}) {
  const normalizedExercises = (Array.isArray(exercises) ? exercises : []).map(normalizeExercise);
  const published = normalizedExercises.filter((exercise) => exercise.status === CONTENT_STATUSES.PUBLISHED);
  const progressList = Array.isArray(progressRows) ? progressRows : [];
  const progressByExerciseId = new Map(progressList.map((row) => [row.exercise_id, row]));
  const nowMs = now instanceof Date ? now.getTime() : Date.now();

  const attempted = [];
  const unseen = [];

  for (const exercise of published) {
    const progress = progressByExerciseId.get(exercise.id) || null;
    const candidate = { ...exercise, progress };
    if (progress) {
      attempted.push(candidate);
    } else {
      unseen.push(candidate);
    }
  }

  const reviewDue = attempted.filter((entry) => isDueForReview(entry.progress, nowMs));
  const reviewFallback = attempted.filter((entry) => !reviewDue.some((due) => due.id === entry.id));

  const selectedNew = selectItems(unseen, newCount, NEW_TYPE_PRIORITY);

  let selectedReview = selectItems(reviewDue, reviewCount, REVIEW_TYPE_PRIORITY, { byDue: true });
  if (selectedReview.length < reviewCount) {
    const remaining = reviewCount - selectedReview.length;
    const extra = selectItems(reviewFallback, remaining, REVIEW_TYPE_PRIORITY, { byDue: true });
    selectedReview = [...selectedReview, ...extra];
  }

  const maxItems = Math.max(1, newCount + reviewCount);
  let mixed = mixSessionItems({
    newItems: selectedNew,
    reviewItems: selectedReview,
    maxItems,
  });

  const selectedIds = new Set(mixed.map((item) => item.id));
  const availablePairs = published.filter(
    (exercise) => exercise.type === EXERCISE_TYPES.PAIRS && !selectedIds.has(exercise.id)
  );
  mixed = injectPairs({ selected: mixed, availablePairs });

  return {
    items: mixed,
    totals: {
      totalPublished: published.length,
      newCandidates: unseen.length,
      reviewCandidates: reviewDue.length,
      selectedNew: mixed.filter((item) => item.mode === "new").length,
      selectedReview: mixed.filter((item) => item.mode === "review").length,
      sessionSize: mixed.length,
    },
  };
}

export function shouldIncludeOnlyPublished(exercise) {
  return normalizeStatus(exercise?.status) === CONTENT_STATUSES.PUBLISHED;
}


