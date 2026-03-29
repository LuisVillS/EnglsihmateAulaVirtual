import { assertOwnedPracticeItem, resolveStudentFromRequest } from "@/lib/duolingo/api-auth";
import { calculatePracticeItemXp, calculatePracticeSessionBonus, calculateAccuracyPercent, deriveRecommendedNextMode } from "@/lib/duolingo/practice-progress";
import { ensureGamificationProfile } from "@/lib/gamification/profile";
import { computeSpacedRepetitionUpdate } from "@/lib/duolingo/sr";
import { recordCompetitionActivity } from "@/lib/competition/service";
import { withSupabaseRequestTrace } from "@/lib/supabase-tracing";

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  return ["1", "true", "yes", "y", "correct"].includes(String(value).toLowerCase());
}

function toPositiveInteger(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return rounded < 1 ? fallback : rounded;
}

function toPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeResults(body) {
  if (Array.isArray(body?.results)) {
    return body.results;
  }

  if (body?.exercise_id || body?.exerciseId) {
    return [
      {
        exercise_id: body.exercise_id || body.exerciseId,
        is_correct: body.is_correct,
        attempts: body.attempts,
        practice_session_id: body.practice_session_id || body.practiceSessionId,
        practice_item_id: body.practice_item_id || body.practiceItemId,
        mode: body.mode,
        answer_snapshot: body.answer_snapshot || body.answerSnapshot,
      },
    ];
  }

  return [];
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function applyXpDelta(db, { userId, legacyXpTotal, xpDelta }) {
  const profile = await ensureGamificationProfile(db, {
    userId,
    legacyXpTotal,
  });

  if (!xpDelta) {
    return profile;
  }

  const nextLifetimeXp = profile.lifetimeXp + xpDelta;
  const nextPracticeXp = profile.practiceXp + xpDelta;
  const nowIso = new Date().toISOString();

  const { error: gamificationError } = await db
    .from("user_gamification_profiles")
    .update({
      lifetime_xp: nextLifetimeXp,
      practice_xp: nextPracticeXp,
      updated_at: nowIso,
    })
    .eq("user_id", userId);

  if (gamificationError) {
    throw new Error(gamificationError.message || "No se pudo actualizar XP de gamificacion.");
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

async function completePracticeSession(db, { sessionId, userId, mode, timeSpentSec = null, legacyXpTotal }) {
  if (!sessionId) {
    return null;
  }

  const { data: session, error: sessionError } = await db
    .from("practice_sessions")
    .select("id, user_id, mode, status, total_items, answered_items, correct_items, accuracy_rate, xp_earned, recommended_next_mode")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message || "No se pudo cargar la sesion de practica.");
  }

  if (!session?.id) {
    return null;
  }

  if (session.status === "completed") {
    return {
      sessionId: session.id,
      mode: session.mode || mode || "mixed_review",
      xpBonus: 0,
      alreadyCompleted: true,
      accuracyPercent: Number(session.accuracy_rate || 0) || 0,
      recommendedNextMode: session.recommended_next_mode || null,
    };
  }

  const { data: itemRows, error: itemError } = await db
    .from("practice_session_items")
    .select("id, source_reason, is_correct, xp_earned, answered_at, exercise_type, skill_tag")
    .eq("practice_session_id", session.id)
    .order("position", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message || "No se pudieron cargar los items de practica.");
  }

  const items = itemRows || [];
  const totalItems = Math.max(0, Number(session.total_items || items.length) || 0);
  const answeredItems = items.filter((item) => item.answered_at).length;
  const correctItems = items.filter((item) => item.is_correct === true).length;
  const accuracyPercent = calculateAccuracyPercent({ totalItems, correctItems });
  const itemXp = items.reduce((sum, item) => sum + Math.max(0, Number(item.xp_earned || 0) || 0), 0);
  const xpBonus = calculatePracticeSessionBonus({
    mode: session.mode || mode,
    totalItems,
    correctItems,
    answeredItems,
    completed: true,
  });
  const hasWeakness = items.some((item) => item.source_reason === "weakness");
  const hasReview = items.some((item) => item.source_reason === "review");
  const listeningItemsCompleted = items.filter(
    (item) =>
      item.answered_at &&
      (
        String(item.skill_tag || "").trim().toLowerCase() === "listening" ||
        String(item.exercise_type || "").trim().toLowerCase() === "audio_match"
      )
  ).length;
  const recommendedNextMode = deriveRecommendedNextMode({
    mode: session.mode || mode,
    accuracyPercent,
    hasWeakness,
    hasReview,
  });

  const nowIso = new Date().toISOString();
  const { error: updateSessionError } = await db
    .from("practice_sessions")
    .update({
      status: "completed",
      answered_items: answeredItems,
      correct_items: correctItems,
      accuracy_rate: accuracyPercent,
      xp_earned: itemXp + xpBonus,
      time_spent_sec: timeSpentSec,
      recommended_next_mode: recommendedNextMode,
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", session.id)
    .eq("user_id", userId);

  if (updateSessionError) {
    throw new Error(updateSessionError.message || "No se pudo cerrar la sesion de practica.");
  }

  if (xpBonus > 0) {
    await applyXpDelta(db, {
      userId,
      legacyXpTotal,
      xpDelta: xpBonus,
    });
  }

  const currentGamification = await ensureGamificationProfile(db, {
    userId,
    legacyXpTotal: legacyXpTotal + xpBonus,
  });

  const { error: gamificationError } = await db
    .from("user_gamification_profiles")
    .update({
      practice_sessions_completed: currentGamification.practiceSessionsCompleted + 1,
      perfect_sessions:
        currentGamification.perfectSessions + (accuracyPercent >= 98 ? 1 : 0),
      timed_challenges_completed:
        currentGamification.timedChallengesCompleted + ((session.mode || mode) === "timed" ? 1 : 0),
      updated_at: nowIso,
    })
    .eq("user_id", userId);

  if (gamificationError) {
    throw new Error(gamificationError.message || "No se pudo actualizar el cierre de gamificacion.");
  }

  return {
    sessionId: session.id,
    mode: session.mode || mode || "mixed_review",
    xpBonus,
    alreadyCompleted: false,
    accuracyPercent,
    totalItems,
    answeredItems,
    correctItems,
    listeningItemsCompleted,
    recommendedNextMode,
    timeSpentSec,
  };
}

export async function POST(request) {
  return withSupabaseRequestTrace("api:POST /api/progress", async () => {
    try {
    const body = await request.json().catch(() => ({}));
    const resolution = await resolveStudentFromRequest({ request, body });
    if (resolution.errorResponse) {
      return resolution.errorResponse;
    }

    const db = resolution.db;
    const profile = resolution.profile;
    const results = normalizeResults(body);
    const shouldCompleteSession = toBoolean(body?.complete_session || body?.completeSession);

    if (!results.length && !shouldCompleteSession) {
      return jsonResponse({ error: "No se enviaron resultados de ejercicios." }, 400);
    }

    let xpDelta = 0;
    const output = [];
    const touchedSessionIds = new Set();

    for (const row of results) {
      const exerciseId = String(row?.exercise_id || row?.exerciseId || "").trim();
      if (!exerciseId) {
        continue;
      }

      const attempts = toPositiveInteger(row?.attempts, 1);
      const isCorrect = toBoolean(row?.is_correct);
      const practiceSessionId = String(
        row?.practice_session_id ||
        row?.practiceSessionId ||
        body?.practice_session_id ||
        body?.practiceSessionId ||
        ""
      ).trim();
      const practiceItemId = String(
        row?.practice_item_id ||
        row?.practiceItemId ||
        body?.practice_item_id ||
        body?.practiceItemId ||
        ""
      ).trim();
      const mode = String(row?.mode || body?.mode || "").trim().toLowerCase() || "mixed_review";
      const answerSnapshot = toPlainObject(row?.answer_snapshot || row?.answerSnapshot);

      if (practiceSessionId) {
        touchedSessionIds.add(practiceSessionId);
      }

      let existingPracticeItem = null;
      if (practiceItemId) {
        const practiceItemResult = await assertOwnedPracticeItem(db, {
          practiceItemId,
          userId: profile.id,
        });

        if (practiceItemResult.errorResponse) {
          return practiceItemResult.errorResponse;
        }

        existingPracticeItem = practiceItemResult.practiceItem || null;
        if (existingPracticeItem?.practice_session_id) {
          touchedSessionIds.add(existingPracticeItem.practice_session_id);
        }
      }

      if (existingPracticeItem?.answered_at) {
        output.push({
          exercise_id: exerciseId,
          is_correct: isCorrect,
          attempts,
          xp_gain: Math.max(0, Number(existingPracticeItem.xp_earned || 0) || 0),
          already_recorded: true,
        });
        continue;
      }

      const { data: existing, error: existingProgressError } = await db
        .from("user_progress")
        .select(
          "id, interval_days, ease_factor, times_seen, times_correct, streak_count"
        )
        .eq("user_id", profile.id)
        .eq("exercise_id", exerciseId)
        .is("lesson_id", null)
        .maybeSingle();

      if (existingProgressError) {
        throw new Error(existingProgressError.message || "No se pudo cargar progreso existente.");
      }

      const srUpdate = computeSpacedRepetitionUpdate({
        prevIntervalDays: existing?.interval_days || 1,
        prevEaseFactor: existing?.ease_factor || 2.5,
        isCorrect,
        attempts,
      });

      const progressPayload = {
        user_id: profile.id,
        exercise_id: exerciseId,
        is_correct: isCorrect,
        attempts,
        last_practiced: new Date().toISOString(),
        interval_days: srUpdate.intervalDays,
        ease_factor: srUpdate.easeFactor,
        next_due_at: srUpdate.nextDueAt,
        last_quality: srUpdate.quality,
        times_seen: Number(existing?.times_seen || 0) + 1,
        times_correct: Number(existing?.times_correct || 0) + (isCorrect ? 1 : 0),
        streak_count: isCorrect ? Number(existing?.streak_count || 0) + 1 : 0,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error: updateProgressError } = await db
          .from("user_progress")
          .update(progressPayload)
          .eq("id", existing.id);

        if (updateProgressError) {
          throw new Error(updateProgressError.message || "No se pudo actualizar progreso.");
        }
      } else {
        const { error: insertProgressError } = await db
          .from("user_progress")
          .insert({
            ...progressPayload,
            created_at: new Date().toISOString(),
            lesson_id: null,
          });

        if (insertProgressError) {
          throw new Error(insertProgressError.message || "No se pudo guardar progreso.");
        }
      }

      const gain = calculatePracticeItemXp({ isCorrect, attempts, mode });
      xpDelta += gain;

      if (practiceItemId) {
        const { error: updatePracticeItemError } = await db
          .from("practice_session_items")
          .update({
            attempts,
            is_correct: isCorrect,
            xp_earned: gain,
            answer_snapshot: answerSnapshot,
            answered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", practiceItemId);

        if (updatePracticeItemError) {
          throw new Error(updatePracticeItemError.message || "No se pudo registrar el item de practica.");
        }
      }

      output.push({
        exercise_id: exerciseId,
        is_correct: isCorrect,
        attempts,
        xp_gain: gain,
        quality: srUpdate.quality,
        ease_factor: srUpdate.easeFactor,
        interval_days: srUpdate.intervalDays,
        next_due_at: srUpdate.nextDueAt,
      });
    }

    let gamification = await applyXpDelta(db, {
      userId: profile.id,
      legacyXpTotal: Number(profile.xp_total || 0) || 0,
      xpDelta,
    });

    let completedSession = null;
    let competition = null;
    if (shouldCompleteSession) {
      const requestedSessionId = String(body?.practice_session_id || body?.practiceSessionId || "").trim();
      if (requestedSessionId) {
        touchedSessionIds.add(requestedSessionId);
      }

      const completionTarget = requestedSessionId || Array.from(touchedSessionIds)[0] || "";
      if (completionTarget) {
        completedSession = await completePracticeSession(db, {
          sessionId: completionTarget,
          userId: profile.id,
          mode: String(body?.mode || "").trim().toLowerCase() || null,
          timeSpentSec: body?.time_spent_sec == null ? null : Number(body.time_spent_sec),
          legacyXpTotal: gamification.lifetimeXp,
        });

        gamification = await ensureGamificationProfile(db, {
          userId: profile.id,
          legacyXpTotal: gamification.lifetimeXp + Math.max(0, Number(completedSession?.xpBonus || 0) || 0),
        });

        if (completedSession && !completedSession.alreadyCompleted) {
          const competitionResult = await recordCompetitionActivity(db, {
            userId: profile.id,
            legacyXpTotal: gamification.lifetimeXp,
            activity: {
              source: "practice",
              mode: completedSession.mode,
              xpEarned:
                output.reduce((sum, entry) => sum + Math.max(0, Number(entry?.xp_gain || 0) || 0), 0) +
                Math.max(0, Number(completedSession?.xpBonus || 0) || 0),
              totalItems: completedSession.totalItems,
              answeredItems: completedSession.answeredItems,
              correctItems: completedSession.correctItems,
              accuracyPercent: completedSession.accuracyPercent,
              listeningItemsCompleted: completedSession.listeningItemsCompleted,
              timeSpentSec: completedSession.timeSpentSec,
            },
          });

          competition = competitionResult.competition;
          gamification = competitionResult.gamification || gamification;
        }
      }
    }

    return jsonResponse({
      student: {
        id: profile.id,
        student_code: profile.student_code,
        xp_total: gamification.lifetimeXp,
        current_streak: Number(profile.current_streak || 0) || 0,
      },
      gamification,
      competition,
      session: completedSession,
      results: output,
      totals: {
        processed: output.length,
        xp_delta: xpDelta + Math.max(0, Number(completedSession?.xpBonus || 0) || 0),
      },
    });
    } catch (error) {
      console.error("POST /api/progress failed", error);
      return jsonResponse({ error: error?.message || "No se pudo registrar progreso." }, 500);
    }
  });
}
