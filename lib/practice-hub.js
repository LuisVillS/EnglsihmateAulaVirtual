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

  if (allowedCefrLevel) {
    categoriesQuery = categoriesQuery.eq("cefr_level", allowedCefrLevel);
    scenariosQuery = scenariosQuery.eq("cefr_level", allowedCefrLevel);
  }

  const [categoriesResult, scenariosResult, recentSessionResult, progressResult] = await Promise.all([
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
      .from("user_progress")
      .select("exercise_id, is_correct, last_quality, next_due_at, times_seen, times_correct, exercise:exercises(skill_tag)")
      .eq("user_id", userId),
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

  const progressRows = progressResult.data || [];
  const recommendation = deriveRecommendation(progressRows);

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
