import {
  CONTENT_STATUSES,
  DEFAULT_NEW_ITEMS,
  DEFAULT_REVIEW_ITEMS,
  EXERCISE_TYPES,
  NEW_TYPE_PRIORITY,
  REVIEW_TYPE_PRIORITY,
  TYPE_BY_LEGACY_KIND,
} from "./constants.js";
import {
  PRACTICE_MODES,
  PRACTICE_SOURCE_REASONS,
} from "./practice-config.js";
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

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTagValue(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "_");
}

function normalizeTextArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeTagValue(value)).filter(Boolean);
}

function resolveEstimatedTimeSec(row, contentJson) {
  const explicit = Number(row?.estimated_time_sec || row?.estimatedTimeSec);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.round(explicit);
  }

  const contentMinutes = Number(contentJson?.estimated_time_minutes || contentJson?.estimatedTimeMinutes);
  if (Number.isFinite(contentMinutes) && contentMinutes > 0) {
    return Math.round(contentMinutes * 60);
  }

  return 90;
}

function normalizeExercise(row) {
  const type = normalizeExerciseType(row?.type) || TYPE_BY_LEGACY_KIND[row?.kind] || EXERCISE_TYPES.CLOZE;
  const contentJson = parseContentJson(row?.content_json ?? row?.payload) || {};
  const category = row?.category || null;

  return {
    id: row?.id,
    lesson_id: row?.lesson_id,
    type,
    status: normalizeStatus(row?.status),
    ordering: Number(row?.ordering || 0) || 0,
    updated_at: row?.updated_at || row?.created_at || null,
    content_json: contentJson,
    lesson: row?.lesson || null,
    skill_tag: normalizeText(row?.skill_tag || row?.skillTag).toLowerCase(),
    cefr_level: normalizeText(row?.cefr_level || row?.cefrLevel).toUpperCase(),
    category_id: row?.category_id || row?.categoryId || category?.id || null,
    category_name: normalizeText(row?.category_name || row?.categoryName || category?.name),
    practice_enabled: row?.practice_enabled !== false,
    ranked_allowed: row?.ranked_allowed === true,
    difficulty_score: row?.difficulty_score == null ? null : Number(row.difficulty_score),
    estimated_time_sec: resolveEstimatedTimeSec(row, contentJson),
    practice_weight: Number(row?.practice_weight || 1) || 1,
    theme_tags: normalizeTextArray(row?.theme_tags || row?.themeTags),
    scenario_tags: normalizeTextArray(row?.scenario_tags || row?.scenarioTags),
  };
}

function typeScore(type, priority) {
  const index = priority.indexOf(type);
  return index === -1 ? priority.length + 1 : index;
}

function getProgressAccuracy(progress) {
  if (!progress) return 0;
  const timesSeen = Math.max(0, Number(progress.times_seen || 0) || 0);
  const timesCorrect = Math.max(0, Number(progress.times_correct || 0) || 0);
  if (!timesSeen) {
    return progress.is_correct ? 1 : 0;
  }
  return timesCorrect / timesSeen;
}

function getWeaknessScore(progress, nowMs) {
  if (!progress) return 0;

  let score = 0;
  if (progress.is_correct === false) score += 4;
  if (Number(progress.last_quality || 0) <= 2) score += 3;
  if (Number(progress.attempts || 0) >= 3) score += 2;
  if (isDueForReview(progress, nowMs)) score += 2;

  const accuracy = getProgressAccuracy(progress);
  if (accuracy < 0.5) score += 3;
  else if (accuracy < 0.7) score += 1;

  return score;
}

function sortCandidates(items, priority, { byDue = false, preferShort = false, byWeakness = false, nowMs = Date.now() } = {}) {
  return [...items].sort((left, right) => {
    if (byWeakness) {
      const weaknessDiff = getWeaknessScore(right?.progress, nowMs) - getWeaknessScore(left?.progress, nowMs);
      if (weaknessDiff !== 0) return weaknessDiff;
    }

    const scoreDiff = typeScore(left.type, priority) - typeScore(right.type, priority);
    if (scoreDiff !== 0) return scoreDiff;

    const weightDiff = Number(right.practice_weight || 1) - Number(left.practice_weight || 1);
    if (weightDiff !== 0) return weightDiff;

    if (preferShort) {
      const timeDiff = Number(left.estimated_time_sec || 90) - Number(right.estimated_time_sec || 90);
      if (timeDiff !== 0) return timeDiff;
    }

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

function interleaveByType(items, priority, limit) {
  if (!items.length || limit <= 0) return [];

  const groups = new Map();
  for (const item of items) {
    const type = item.type || "";
    const existing = groups.get(type) || [];
    existing.push(item);
    groups.set(type, existing);
  }

  const orderedTypes = Array.from(
    new Set([
      ...priority,
      ...Array.from(groups.keys()).filter((type) => !priority.includes(type)).sort(),
    ])
  );

  const output = [];
  while (output.length < limit) {
    let pushedThisRound = false;
    for (const type of orderedTypes) {
      const bucket = groups.get(type) || [];
      if (!bucket.length) continue;
      output.push(bucket.shift());
      pushedThisRound = true;
      if (output.length >= limit) break;
    }
    if (!pushedThisRound) break;
  }

  return output;
}

function selectItems(items, limit, priority, options = {}) {
  if (!items.length || limit <= 0) return [];
  return interleaveByType(sortCandidates(items, priority, options), priority, limit);
}

function isDueForReview(progress, nowMs) {
  if (!progress) return false;
  if (progress.is_correct === false) return true;
  if (Number(progress.last_quality) <= 2) return true;

  const dueMs = toTimestamp(progress.next_due_at);
  return Number.isFinite(dueMs) && dueMs <= nowMs;
}

function matchesPracticeFilters(exercise, filters = {}) {
  if (filters.skill && exercise.skill_tag !== filters.skill) return false;
  if (filters.cefrLevel && exercise.cefr_level !== filters.cefrLevel) return false;
  if (filters.categoryId && String(exercise.category_id || "") !== String(filters.categoryId)) return false;
  if (filters.theme) {
    const normalizedTheme = normalizeTagValue(filters.theme);
    const categoryMatch = normalizeTagValue(exercise.category_name) === normalizedTheme;
    const tagMatch = exercise.theme_tags.includes(normalizedTheme);
    if (!categoryMatch && !tagMatch) return false;
  }
  if (filters.scenario) {
    const normalizedScenario = normalizeTagValue(filters.scenario);
    if (!exercise.scenario_tags.includes(normalizedScenario)) return false;
  }
  if (Array.isArray(filters.allowedTypes) && filters.allowedTypes.length && !filters.allowedTypes.includes(exercise.type)) {
    return false;
  }
  return true;
}

function splitPoolByProgress(exercises, progressByExerciseId) {
  const attempted = [];
  const unseen = [];

  for (const exercise of exercises) {
    const progress = progressByExerciseId.get(exercise.id) || null;
    const candidate = { ...exercise, progress };
    if (progress) {
      attempted.push(candidate);
    } else {
      unseen.push(candidate);
    }
  }

  return { attempted, unseen };
}

function tagItems(items, sourceReason) {
  return items.map((item) => ({
    ...item,
    source_reason: sourceReason,
    mode: sourceReason,
  }));
}

function mixSessionItems({ primaryItems, secondaryItems, maxItems }) {
  const output = [];
  const primaryQueue = [...primaryItems];
  const secondaryQueue = [...secondaryItems];

  while (output.length < maxItems && (primaryQueue.length || secondaryQueue.length)) {
    if (primaryQueue.length) {
      const item = primaryQueue.shift();
      if (item) output.push(item);
    }
    if (output.length >= maxItems) break;
    if (secondaryQueue.length) {
      const item = secondaryQueue.shift();
      if (item) output.push(item);
    }
  }

  return output.slice(0, maxItems);
}

function injectPairs({ selected, availablePairs, sourceReason }) {
  if (!availablePairs.length || !selected.length) {
    return selected;
  }

  const hasPairs = selected.some((item) => item.type === EXERCISE_TYPES.PAIRS);
  if (hasPairs) return selected;

  const pairItem = availablePairs[0];
  const insertAt = Math.min(4, selected.length);
  const next = [...selected];
  next.splice(insertAt, 0, {
    ...pairItem,
    source_reason: sourceReason,
    mode: sourceReason,
  });
  return next.slice(0, selected.length);
}

function deriveWeakSkills(attempted) {
  const bySkill = new Map();

  for (const entry of attempted) {
    const skill = entry.skill_tag || "grammar";
    const current = bySkill.get(skill) || { skill, seen: 0, accuracyTotal: 0, weakness: 0 };
    current.seen += 1;
    current.accuracyTotal += getProgressAccuracy(entry.progress);
    current.weakness += getWeaknessScore(entry.progress, Date.now());
    bySkill.set(skill, current);
  }

  return Array.from(bySkill.values())
    .map((entry) => ({
      ...entry,
      accuracy: entry.seen ? entry.accuracyTotal / entry.seen : 0,
    }))
    .sort((left, right) => {
      const accuracyDiff = left.accuracy - right.accuracy;
      if (accuracyDiff !== 0) return accuracyDiff;
      const weaknessDiff = right.weakness - left.weakness;
      if (weaknessDiff !== 0) return weaknessDiff;
      return right.seen - left.seen;
    });
}

function buildMixedModeItems({
  pool,
  progressByExerciseId,
  nowMs,
  newCount,
  reviewCount,
  newReason = PRACTICE_SOURCE_REASONS.NEW,
  reviewReason = PRACTICE_SOURCE_REASONS.REVIEW,
  preferShort = false,
}) {
  const { attempted, unseen } = splitPoolByProgress(pool, progressByExerciseId);
  const reviewDue = attempted.filter((entry) => isDueForReview(entry.progress, nowMs));
  const reviewFallback = attempted.filter((entry) => !reviewDue.some((due) => due.id === entry.id));

  const selectedNew = tagItems(selectItems(unseen, newCount, NEW_TYPE_PRIORITY, { preferShort }), newReason);

  let selectedReview = tagItems(
    selectItems(reviewDue, reviewCount, REVIEW_TYPE_PRIORITY, { byDue: true, preferShort }),
    reviewReason
  );

  if (selectedReview.length < reviewCount) {
    const missing = reviewCount - selectedReview.length;
    const existingIds = new Set(selectedReview.map((item) => item.id));
    const extra = selectItems(
      reviewFallback.filter((entry) => !existingIds.has(entry.id)),
      missing,
      REVIEW_TYPE_PRIORITY,
      { byDue: true, preferShort }
    );
    selectedReview = [...selectedReview, ...tagItems(extra, reviewReason)];
  }

  return {
    attempted,
    unseen,
    items: mixSessionItems({
      primaryItems: selectedNew,
      secondaryItems: selectedReview,
      maxItems: Math.max(1, newCount + reviewCount),
    }),
    reviewDueCount: reviewDue.length,
  };
}

function buildTimedChallengeItems({ pool, progressByExerciseId, size }) {
  const challengePool = pool.filter(
    (exercise) =>
      exercise.estimated_time_sec <= 180 &&
      [
        EXERCISE_TYPES.SCRAMBLE,
        EXERCISE_TYPES.CLOZE,
        EXERCISE_TYPES.IMAGE_MATCH,
        EXERCISE_TYPES.PAIRS,
        EXERCISE_TYPES.AUDIO_MATCH,
      ].includes(exercise.type)
  );

  const effectivePool = challengePool.length ? challengePool : pool;
  const { attempted, unseen } = splitPoolByProgress(effectivePool, progressByExerciseId);
  const ordered = [
    ...selectItems(unseen, size, [
      EXERCISE_TYPES.CLOZE,
      EXERCISE_TYPES.SCRAMBLE,
      EXERCISE_TYPES.IMAGE_MATCH,
      EXERCISE_TYPES.PAIRS,
      EXERCISE_TYPES.AUDIO_MATCH,
      EXERCISE_TYPES.READING_EXERCISE,
    ], { preferShort: true }),
    ...selectItems(attempted, size, REVIEW_TYPE_PRIORITY, { preferShort: true, byDue: true }),
  ];

  const unique = [];
  const seenIds = new Set();
  for (const item of ordered) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    unique.push({
      ...item,
      source_reason: PRACTICE_SOURCE_REASONS.CHALLENGE,
      mode: PRACTICE_SOURCE_REASONS.CHALLENGE,
    });
    if (unique.length >= size) break;
  }

  return {
    items: unique,
    attempted,
    unseen,
  };
}

function buildWeaknessItems({ pool, progressByExerciseId, nowMs, size }) {
  const { attempted, unseen } = splitPoolByProgress(pool, progressByExerciseId);
  const weakCandidates = attempted.filter((entry) => getWeaknessScore(entry.progress, nowMs) > 0);
  const weakSkills = deriveWeakSkills(attempted).slice(0, 2).map((entry) => entry.skill);

  let items = tagItems(
    selectItems(weakCandidates, Math.min(size, Math.ceil(size * 0.7)), REVIEW_TYPE_PRIORITY, {
      byDue: true,
      byWeakness: true,
      preferShort: true,
      nowMs,
    }),
    PRACTICE_SOURCE_REASONS.WEAKNESS
  );

  if (items.length < size && weakSkills.length) {
    const selectedIds = new Set(items.map((item) => item.id));
    const skillPool = pool.filter(
      (entry) => weakSkills.includes(entry.skill_tag) && !selectedIds.has(entry.id)
    );
    const skillProgressById = new Map(
      Array.from(progressByExerciseId.entries()).filter(([exerciseId]) =>
        skillPool.some((entry) => entry.id === exerciseId)
      )
    );
    const mixed = buildMixedModeItems({
      pool: skillPool,
      progressByExerciseId: skillProgressById,
      nowMs,
      newCount: Math.ceil((size - items.length) / 2),
      reviewCount: Math.floor((size - items.length) / 2),
      newReason: PRACTICE_SOURCE_REASONS.WEAKNESS,
      reviewReason: PRACTICE_SOURCE_REASONS.WEAKNESS,
      preferShort: true,
    }).items;

    items = [...items, ...mixed].slice(0, size);
  }

  if (!items.length) {
    items = buildMixedModeItems({
      pool,
      progressByExerciseId,
      nowMs,
      newCount: Math.ceil(size / 2),
      reviewCount: Math.floor(size / 2),
      newReason: PRACTICE_SOURCE_REASONS.REVIEW,
      reviewReason: PRACTICE_SOURCE_REASONS.REVIEW,
      preferShort: true,
    }).items;
  }

  return {
    items,
    attempted,
    unseen,
    weakSkills,
    hasWeakness: weakCandidates.length > 0,
  };
}

function createTotals({ published, attempted, unseen, items, reviewDueCount = 0 }) {
  return {
    totalPublished: published.length,
    newCandidates: unseen.length,
    reviewCandidates: reviewDueCount,
    attemptedCandidates: attempted.length,
    selectedNew: items.filter((item) => item.source_reason === PRACTICE_SOURCE_REASONS.NEW).length,
    selectedReview: items.filter((item) => item.source_reason === PRACTICE_SOURCE_REASONS.REVIEW).length,
    selectedWeakness: items.filter((item) => item.source_reason === PRACTICE_SOURCE_REASONS.WEAKNESS).length,
    selectedChallenge: items.filter((item) => item.source_reason === PRACTICE_SOURCE_REASONS.CHALLENGE).length,
    selectedScenario: items.filter((item) => item.source_reason === PRACTICE_SOURCE_REASONS.SCENARIO).length,
    sessionSize: items.length,
  };
}

export function buildPracticeSessionPlan({
  exercises,
  progressRows,
  now = new Date(),
  mode = PRACTICE_MODES.MIXED_REVIEW,
  size = DEFAULT_NEW_ITEMS + DEFAULT_REVIEW_ITEMS,
  filters = {},
}) {
  const normalizedExercises = (Array.isArray(exercises) ? exercises : []).map(normalizeExercise);
  const published = normalizedExercises.filter(
    (exercise) =>
      exercise.status === CONTENT_STATUSES.PUBLISHED &&
      exercise.practice_enabled &&
      matchesPracticeFilters(exercise, filters)
  );
  const progressList = Array.isArray(progressRows) ? progressRows : [];
  const progressByExerciseId = new Map(progressList.map((row) => [row.exercise_id, row]));
  const nowMs = now instanceof Date ? now.getTime() : Date.now();

  if (mode === PRACTICE_MODES.DIRECT) {
    const items = published.map((item) => ({
      ...item,
      source_reason: PRACTICE_SOURCE_REASONS.CLASS,
      mode: PRACTICE_SOURCE_REASONS.CLASS,
      progress: progressByExerciseId.get(item.id) || null,
    }));

    return {
      items,
      totals: createTotals({
        published,
        attempted: items.filter((item) => item.progress),
        unseen: items.filter((item) => !item.progress),
        items,
      }),
      meta: {
        weakSkills: [],
        hasWeaknessCandidates: false,
        hasReviewCandidates: items.some((item) => item.progress),
      },
    };
  }

  let result = null;
  const safeSize = Math.max(1, Number(size || 0) || 0);

  if (mode === PRACTICE_MODES.TIMED) {
    result = buildTimedChallengeItems({
      pool: published,
      progressByExerciseId,
      size: safeSize,
    });
  } else if (mode === PRACTICE_MODES.WEAKNESS) {
    result = buildWeaknessItems({
      pool: published,
      progressByExerciseId,
      nowMs,
      size: safeSize,
    });
  } else {
    let newCount = Math.ceil(safeSize / 2);
    let reviewCount = Math.floor(safeSize / 2);
    let newReason = PRACTICE_SOURCE_REASONS.NEW;
    let reviewReason = PRACTICE_SOURCE_REASONS.REVIEW;
    let preferShort = false;

    if (mode === PRACTICE_MODES.QUICK) {
      newCount = Math.ceil(safeSize * 0.6);
      reviewCount = safeSize - newCount;
      preferShort = true;
    } else if (mode === PRACTICE_MODES.TOPIC) {
      newCount = Math.ceil(safeSize * 0.65);
      reviewCount = safeSize - newCount;
    } else if (mode === PRACTICE_MODES.SCENARIO) {
      newReason = PRACTICE_SOURCE_REASONS.SCENARIO;
      reviewReason = PRACTICE_SOURCE_REASONS.SCENARIO;
    }

    result = buildMixedModeItems({
      pool: published,
      progressByExerciseId,
      nowMs,
      newCount,
      reviewCount,
      newReason,
      reviewReason,
      preferShort,
    });
  }

  let items = result?.items || [];

  if (![PRACTICE_MODES.TIMED, PRACTICE_MODES.DIRECT].includes(mode)) {
    const selectedIds = new Set(items.map((item) => item.id));
    const availablePairs = published.filter(
      (exercise) => exercise.type === EXERCISE_TYPES.PAIRS && !selectedIds.has(exercise.id)
    );
    items = injectPairs({
      selected: items,
      availablePairs,
      sourceReason:
        mode === PRACTICE_MODES.WEAKNESS
          ? PRACTICE_SOURCE_REASONS.WEAKNESS
          : mode === PRACTICE_MODES.SCENARIO
          ? PRACTICE_SOURCE_REASONS.SCENARIO
          : PRACTICE_SOURCE_REASONS.REVIEW,
    });
  }

  const attempted = result?.attempted || [];
  const unseen = result?.unseen || [];
  const weakSkills = result?.weakSkills || [];
  const reviewDueCount = result?.reviewDueCount || attempted.filter((entry) => isDueForReview(entry.progress, nowMs)).length;

  return {
    items,
    totals: createTotals({
      published,
      attempted,
      unseen,
      items,
      reviewDueCount,
    }),
    meta: {
      weakSkills,
      hasWeaknessCandidates: Boolean(result?.hasWeakness || weakSkills.length),
      hasReviewCandidates: reviewDueCount > 0,
    },
  };
}

export function buildSessionPlan({
  exercises,
  progressRows,
  now = new Date(),
  newCount = DEFAULT_NEW_ITEMS,
  reviewCount = DEFAULT_REVIEW_ITEMS,
}) {
  return buildPracticeSessionPlan({
    exercises,
    progressRows,
    now,
    mode: PRACTICE_MODES.MIXED_REVIEW,
    size: Math.max(1, newCount + reviewCount),
  });
}

export function shouldIncludeOnlyPublished(exercise) {
  return normalizeStatus(exercise?.status) === CONTENT_STATUSES.PUBLISHED;
}
