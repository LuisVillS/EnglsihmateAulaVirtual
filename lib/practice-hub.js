import { ensureGamificationProfile } from "@/lib/gamification/profile";
import { PRACTICE_MODES } from "@/lib/duolingo/practice-config";
import { loadCompetitionSummary } from "@/lib/competition/service";
import { normalizeStudentCefrLevel } from "@/lib/student-levels";

function toTimestamp(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
}

function isDue(progress, nowMs) {
  if (!progress) return false;
  if (progress.is_correct === false) return true;
  if (Number(progress.last_quality || 0) <= 2) return true;
  const dueAt = toTimestamp(progress.next_due_at);
  return Number.isFinite(dueAt) && dueAt <= nowMs;
}

function getAccuracy(progress) {
  const seen = Math.max(0, Number(progress?.times_seen || 0) || 0);
  const correct = Math.max(0, Number(progress?.times_correct || 0) || 0);
  if (!seen) {
    return progress?.is_correct ? 1 : 0;
  }
  return correct / seen;
}

function deriveRecommendation(progressRows = []) {
  const nowMs = Date.now();
  const dueReviewCount = progressRows.filter((row) => isDue(row, nowMs)).length;
  const skillStats = new Map();

  for (const row of progressRows) {
    const skill = String(row?.exercise?.skill_tag || "").trim().toLowerCase() || "grammar";
    const current = skillStats.get(skill) || { skill, count: 0, accuracyTotal: 0 };
    current.count += 1;
    current.accuracyTotal += getAccuracy(row);
    skillStats.set(skill, current);
  }

  const weakest = Array.from(skillStats.values())
    .map((entry) => ({
      ...entry,
      accuracy: entry.count ? entry.accuracyTotal / entry.count : 0,
    }))
    .sort((left, right) => left.accuracy - right.accuracy)[0] || null;

  if (dueReviewCount >= 4) {
    return {
      mode: PRACTICE_MODES.MIXED_REVIEW,
      title: "Mixed Review recommended",
      description: "You already have review items due. Start with an adaptive session to clear them.",
      weakestSkill: weakest?.skill || null,
      dueReviewCount,
    };
  }

  if (weakest?.count >= 3 && weakest.accuracy < 0.72) {
    return {
      mode: PRACTICE_MODES.WEAKNESS,
      title: "Weakness Recovery recommended",
      description: "Your recent results show a weaker skill area worth targeting directly.",
      weakestSkill: weakest.skill,
      dueReviewCount,
    };
  }

  return {
    mode: PRACTICE_MODES.QUICK,
    title: "Quick Practice recommended",
    description: "A fast mixed session is the best next step right now.",
    weakestSkill: weakest?.skill || null,
    dueReviewCount,
  };
}

function collectScenarioOptions(rows = []) {
  const values = new Set();
  for (const row of rows) {
    const tags = Array.isArray(row?.scenario_tags) ? row.scenario_tags : [];
    for (const tag of tags) {
      const value = String(tag || "").trim().toLowerCase();
      if (value) values.add(value);
    }
  }
  return Array.from(values).sort().map((value) => ({
    value,
    label: value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
  }));
}

function toText(value) {
  return String(value || "").trim();
}

function formatSkillLabel(value) {
  const normalized = toText(value).toLowerCase();
  switch (normalized) {
    case "vocabulary":
      return "Vocabulario";
    case "grammar":
      return "Gramatica";
    case "listening":
      return "Listening";
    case "reading":
      return "Reading";
    case "writing":
      return "Writing";
    default:
      return normalized ? normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Practice";
  }
}

function summarizePrompt(value, fallback = "") {
  const normalized = toText(value).replace(/\s+/g, " ");
  if (!normalized) return fallback;
  if (normalized.length <= 88) return normalized;
  return `${normalized.slice(0, 85).trimEnd()}...`;
}

function estimateExerciseMinutes(row) {
  const type = toText(row?.type).toLowerCase();
  const skill = toText(row?.skill_tag).toLowerCase();
  if (type.includes("flash") || skill === "vocabulary") return 5;
  if (type.includes("quiz") || type.includes("multiple")) return 8;
  if (type.includes("audio") || skill === "listening") return 15;
  if (type.includes("writing")) return 10;
  return 8;
}

function getExerciseProgressState(row, progressByExerciseId) {
  const progress = progressByExerciseId.get(String(row?.id || "").trim());
  if (!progress) {
    return {
      progressPercent: 0,
      progressLabel: "Pendiente",
      status: "pending",
    };
  }

  const seen = Math.max(0, Number(progress?.times_seen || 0) || 0);
  const percent = Math.round(getAccuracy(progress) * 100);

  if (!seen && !progress?.is_correct) {
    return {
      progressPercent: 0,
      progressLabel: "Pendiente",
      status: "pending",
    };
  }

  return {
    progressPercent: Math.max(0, Math.min(100, percent)),
    progressLabel: `${Math.max(0, Math.min(100, percent))}%`,
    status: percent >= 100 ? "completed" : "started",
  };
}

function buildExerciseCard(row, progressByExerciseId) {
  const categoryName = toText(row?.category?.name);
  const skill = toText(row?.skill_tag || row?.category?.skill).toLowerCase();
  const type = toText(row?.type).toLowerCase();
  const title = toText(row?.title) || `${formatSkillLabel(skill)} Practice`;
  const description = summarizePrompt(row?.prompt, categoryName || "Continua con una practica guiada para reforzar este tema.");
  const progress = getExerciseProgressState(row, progressByExerciseId);

  return {
    id: String(row?.id || "").trim(),
    title,
    description,
    skill,
    skillLabel: formatSkillLabel(skill),
    type,
    typeLabel: type ? type.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Practice",
    durationMinutes: estimateExerciseMinutes(row),
    progressPercent: progress.progressPercent,
    progressLabel: progress.progressLabel,
    status: progress.status,
    categoryName,
  };
}

function buildFeaturedExercises(rows = [], progressRows = []) {
  const progressByExerciseId = new Map(progressRows.map((row) => [String(row?.exercise_id || "").trim(), row]));
  const preferredSkillOrder = ["vocabulary", "grammar", "listening", "reading", "writing"];
  const sortedRows = [...rows].sort((left, right) => {
    const leftSkill = preferredSkillOrder.indexOf(toText(left?.skill_tag).toLowerCase());
    const rightSkill = preferredSkillOrder.indexOf(toText(right?.skill_tag).toLowerCase());
    const skillCompare = (leftSkill === -1 ? 99 : leftSkill) - (rightSkill === -1 ? 99 : rightSkill);
    if (skillCompare !== 0) return skillCompare;
    return toText(right?.updated_at).localeCompare(toText(left?.updated_at));
  });

  const selected = [];
  const seenSkills = new Set();

  for (const row of sortedRows) {
    const skill = toText(row?.skill_tag).toLowerCase();
    if (!row?.id || seenSkills.has(skill)) continue;
    selected.push(buildExerciseCard(row, progressByExerciseId));
    seenSkills.add(skill);
    if (selected.length === 4) break;
  }

  if (selected.length < 4) {
    for (const row of sortedRows) {
      if (!row?.id || selected.some((entry) => entry.id === String(row.id))) continue;
      selected.push(buildExerciseCard(row, progressByExerciseId));
      if (selected.length === 4) break;
    }
  }

  return selected;
}

function computePracticeStreak(sessionRows = []) {
  const uniqueDays = Array.from(
    new Set(
      sessionRows
        .map((row) => toText(row?.completed_at || row?.started_at))
        .filter(Boolean)
        .map((value) => value.slice(0, 10))
    )
  ).sort((left, right) => right.localeCompare(left));

  if (!uniqueDays.length) return 0;

  let streak = 1;
  for (let index = 1; index < uniqueDays.length; index += 1) {
    const previous = new Date(`${uniqueDays[index - 1]}T00:00:00Z`);
    const current = new Date(`${uniqueDays[index]}T00:00:00Z`);
    const diffDays = Math.round((previous.getTime() - current.getTime()) / 86400000);
    if (diffDays === 1) {
      streak += 1;
      continue;
    }
    break;
  }

  return streak;
}

function computeImprovementPercent(sessionRows = []) {
  const validRows = sessionRows.filter((row) => Number.isFinite(Number(row?.accuracy_rate)));
  const recent = validRows.slice(0, 3);
  const previous = validRows.slice(3, 6);
  const average = (rows) =>
    rows.length ? rows.reduce((total, row) => total + (Number(row?.accuracy_rate || 0) || 0), 0) / rows.length : 0;

  const recentAverage = average(recent);
  const previousAverage = average(previous);
  if (!recent.length && !previous.length) return 0;
  if (!previous.length) return Math.round(recentAverage);
  return Math.round(recentAverage - previousAverage);
}

function computeOverallScore(sessionRows = [], progressRows = []) {
  const recentRows = sessionRows.slice(0, 6);
  if (recentRows.length) {
    return Math.round(recentRows.reduce((total, row) => total + (Number(row?.accuracy_rate || 0) || 0), 0) / recentRows.length);
  }

  if (progressRows.length) {
    return Math.round((progressRows.reduce((total, row) => total + getAccuracy(row), 0) / progressRows.length) * 100);
  }

  return 0;
}

function buildAnalytics({ courseLevel = "", recommendation = null, recentSessions = [], progressRows = [] }) {
  const improvementPercent = computeImprovementPercent(recentSessions);
  const focusSkill = formatSkillLabel(recommendation?.weakestSkill || "grammar");
  const overallScore = computeOverallScore(recentSessions, progressRows);
  const streakDays = computePracticeStreak(recentSessions);

  return {
    headlineLevel: toText(courseLevel) || "A1",
    focusSkill,
    improvementPercent,
    overallScore,
    streakDays,
    visualRows: recentSessions.slice(0, 5).map((row, index) => ({
      id: row?.id || `row-${index}`,
      label: toText(row?.mode).replace(/_/g, " ") || "practice",
      accuracy: Math.round(Number(row?.accuracy_rate || 0) || 0),
      xpEarned: Math.round(Number(row?.xp_earned || 0) || 0),
      completedAt: toText(row?.completed_at || row?.started_at),
    })),
  };
}

export async function loadPracticeHubData(db, { userId, legacyXpTotal = 0, courseLevel = "" }) {
  const gamification = await ensureGamificationProfile(db, {
    userId,
    legacyXpTotal,
  });
  const [sectionData, competition] = await Promise.all([
    loadPracticeSectionData(db, { userId, courseLevel }),
    loadCompetitionSummary(db, {
      userId,
      legacyXpTotal,
    }),
  ]);

  return {
    gamification,
    competition,
    ...sectionData,
  };
}

export async function loadPracticeSectionData(db, { userId, courseLevel = "" }) {
  const allowedCefrLevel = normalizeStudentCefrLevel(courseLevel);
  let categoriesQuery = db
    .from("exercises")
    .select("category:exercise_categories (id, name, skill, cefr_level)")
    .eq("status", "published")
    .eq("practice_enabled", true);

  let scenariosQuery = db
    .from("exercises")
    .select("scenario_tags")
    .eq("status", "published")
    .eq("practice_enabled", true);

  let featuredExercisesQuery = db
    .from("exercises")
    .select(`
      id,
      title,
      prompt,
      type,
      status,
      skill_tag,
      cefr_level,
      category_id,
      updated_at,
      category:exercise_categories (
        id,
        name,
        skill,
        cefr_level
      )
    `)
    .eq("status", "published")
    .eq("practice_enabled", true);

  if (allowedCefrLevel) {
    categoriesQuery = categoriesQuery.eq("cefr_level", allowedCefrLevel);
    scenariosQuery = scenariosQuery.eq("cefr_level", allowedCefrLevel);
    featuredExercisesQuery = featuredExercisesQuery.eq("cefr_level", allowedCefrLevel);
  }

  const [categoriesResult, scenariosResult, recentSessionResult, recentSessionsResult, progressResult, featuredExercisesResult] = await Promise.all([
    categoriesQuery.order("updated_at", { ascending: false }),
    scenariosQuery,
    db
      .from("practice_sessions")
      .select("id, mode, status, accuracy_rate, xp_earned, completed_at, started_at, recommended_next_mode")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("practice_sessions")
      .select("id, mode, status, accuracy_rate, xp_earned, completed_at, started_at, recommended_next_mode")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(12),
    db
      .from("user_progress")
      .select("exercise_id, is_correct, last_quality, next_due_at, times_seen, times_correct, exercise:exercises(skill_tag)")
      .eq("user_id", userId),
    featuredExercisesQuery.order("updated_at", { ascending: false }).limit(24),
  ]);

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message || "No se pudieron cargar categorias de practica.");
  }
  if (scenariosResult.error) {
    throw new Error(scenariosResult.error.message || "No se pudieron cargar escenarios de practica.");
  }
  if (recentSessionResult.error) {
    throw new Error(recentSessionResult.error.message || "No se pudo cargar el historial de practica.");
  }
  if (progressResult.error) {
    throw new Error(progressResult.error.message || "No se pudo analizar el progreso de practica.");
  }
  if (recentSessionsResult.error) {
    throw new Error(recentSessionsResult.error.message || "No se pudo cargar el historial extendido de practica.");
  }
  if (featuredExercisesResult.error) {
    throw new Error(featuredExercisesResult.error.message || "No se pudieron cargar los ejercicios destacados.");
  }

  const progressRows = progressResult.data || [];
  const recommendation = deriveRecommendation(progressRows);
  const recentSessions = recentSessionsResult.data || [];
  const featuredExercises = buildFeaturedExercises(featuredExercisesResult.data || [], progressRows);

  const categories = Array.from(
    new Map(
      (categoriesResult.data || [])
        .map((row) => row?.category || null)
        .filter((row) => row?.id)
        .map((row) => [
          String(row.id || "").trim(),
          {
            id: String(row.id || "").trim(),
            name: String(row.name || "").trim(),
            skill: String(row.skill || "").trim().toLowerCase(),
            cefrLevel: String(row.cefr_level || "").trim().toUpperCase(),
          },
        ])
    ).values()
  ).sort((left, right) => {
    const skillCompare = left.skill.localeCompare(right.skill, "en", { sensitivity: "base" });
    if (skillCompare !== 0) return skillCompare;
    const levelCompare = left.cefrLevel.localeCompare(right.cefrLevel, "en", { sensitivity: "base" });
    if (levelCompare !== 0) return levelCompare;
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  return {
    allowedCefrLevel,
    categories,
    scenarios: collectScenarioOptions(scenariosResult.data || []),
    recommendation,
    featuredExercises,
    analytics: buildAnalytics({
      courseLevel,
      recommendation,
      recentSessions,
      progressRows,
    }),
    recentSession: recentSessionResult.data
      ? {
          id: recentSessionResult.data.id,
          mode: recentSessionResult.data.mode,
          status: recentSessionResult.data.status,
          accuracyRate: Number(recentSessionResult.data.accuracy_rate || 0) || 0,
          xpEarned: Number(recentSessionResult.data.xp_earned || 0) || 0,
          completedAt: recentSessionResult.data.completed_at || null,
          startedAt: recentSessionResult.data.started_at || null,
          recommendedNextMode: recentSessionResult.data.recommended_next_mode || null,
        }
      : null,
  };
}
