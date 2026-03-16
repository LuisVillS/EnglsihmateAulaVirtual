import { ensureGamificationProfile } from "@/lib/gamification/profile";

function clampNonNegativeInteger(value) {
  return Math.max(0, Math.round(Number(value || 0) || 0));
}

export async function applyGamificationDelta(db, {
  userId,
  legacyXpTotal = 0,
  xpDelta = 0,
  practiceXpDelta = 0,
  flashcardXpDelta = 0,
  stats = {},
} = {}) {
  const profile = await ensureGamificationProfile(db, {
    userId,
    legacyXpTotal,
  });

  const safeXpDelta = clampNonNegativeInteger(xpDelta);
  const safePracticeXpDelta = clampNonNegativeInteger(practiceXpDelta);
  const safeFlashcardXpDelta = clampNonNegativeInteger(flashcardXpDelta);
  const nextLifetimeXp = profile.lifetimeXp + safeXpDelta;
  const nowIso = new Date().toISOString();

  const updatePayload = {
    lifetime_xp: nextLifetimeXp,
    practice_xp: profile.practiceXp + safePracticeXpDelta,
    flashcard_xp: profile.flashcardXp + safeFlashcardXpDelta,
    practice_sessions_completed:
      profile.practiceSessionsCompleted + clampNonNegativeInteger(stats?.practiceSessionsCompleted),
    flashcard_sessions_completed:
      profile.flashcardSessionsCompleted + clampNonNegativeInteger(stats?.flashcardSessionsCompleted),
    perfect_sessions:
      profile.perfectSessions + clampNonNegativeInteger(stats?.perfectSessions),
    timed_challenges_completed:
      profile.timedChallengesCompleted + clampNonNegativeInteger(stats?.timedChallengesCompleted),
    updated_at: nowIso,
  };

  const { error: gamificationError } = await db
    .from("user_gamification_profiles")
    .update(updatePayload)
    .eq("user_id", userId);

  if (gamificationError) {
    throw new Error(gamificationError.message || "No se pudo actualizar el perfil de gamificacion.");
  }

  const { error: profileError } = await db
    .from("profiles")
    .update({
      xp_total: nextLifetimeXp,
    })
    .eq("id", userId);

  if (profileError) {
    throw new Error(profileError.message || "No se pudo sincronizar XP en el perfil.");
  }

  return ensureGamificationProfile(db, {
    userId,
    legacyXpTotal: nextLifetimeXp,
  });
}

