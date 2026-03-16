import { buildLevelProgress, normalizeLifetimeXp } from "./levels.js";

function mapRow(row, legacyXpTotal = 0) {
  const lifetimeXp = Math.max(
    normalizeLifetimeXp(row?.lifetime_xp),
    normalizeLifetimeXp(legacyXpTotal)
  );

  return {
    userId: row?.user_id || null,
    lifetimeXp,
    practiceXp: normalizeLifetimeXp(row?.practice_xp),
    flashcardXp: normalizeLifetimeXp(row?.flashcard_xp),
    practiceSessionsCompleted: Math.max(0, Number(row?.practice_sessions_completed || 0) || 0),
    flashcardSessionsCompleted: Math.max(0, Number(row?.flashcard_sessions_completed || 0) || 0),
    perfectSessions: Math.max(0, Number(row?.perfect_sessions || 0) || 0),
    timedChallengesCompleted: Math.max(0, Number(row?.timed_challenges_completed || 0) || 0),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    ...buildLevelProgress(lifetimeXp),
  };
}

export async function ensureGamificationProfile(db, { userId, legacyXpTotal = 0 }) {
  if (!userId) {
    return mapRow(null, legacyXpTotal);
  }

  let { data, error } = await db
    .from("user_gamification_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo cargar el perfil de gamificacion.");
  }

  if (!data) {
    const insertPayload = {
      user_id: userId,
      lifetime_xp: normalizeLifetimeXp(legacyXpTotal),
      practice_xp: normalizeLifetimeXp(legacyXpTotal),
      flashcard_xp: 0,
    };

    const insertResult = await db
      .from("user_gamification_profiles")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertResult.error) {
      throw new Error(insertResult.error.message || "No se pudo crear el perfil de gamificacion.");
    }

    data = insertResult.data;
  }

  const normalizedLegacyXp = normalizeLifetimeXp(legacyXpTotal);
  if (normalizedLegacyXp > normalizeLifetimeXp(data?.lifetime_xp)) {
    const updateResult = await db
      .from("user_gamification_profiles")
      .update({
        lifetime_xp: normalizedLegacyXp,
        practice_xp: Math.max(normalizedLegacyXp, normalizeLifetimeXp(data?.practice_xp)),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select("*")
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message || "No se pudo sincronizar el perfil de gamificacion.");
    }

    data = updateResult.data;
  }

  return mapRow(data, legacyXpTotal);
}
