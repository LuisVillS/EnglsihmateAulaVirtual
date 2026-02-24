import { NextResponse } from "next/server";
import { resolveStudentFromRequest } from "@/lib/duolingo/api-auth";
import { computeSpacedRepetitionUpdate } from "@/lib/duolingo/sr";

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
      },
    ];
  }

  return [];
}

function calculateXpGain({ isCorrect, attempts }) {
  if (!isCorrect) return 2;
  if (attempts <= 1) return 15;
  if (attempts === 2) return 12;
  return 10;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolution = await resolveStudentFromRequest({ request, body });
    if (resolution.errorResponse) {
      return resolution.errorResponse;
    }

    const db = resolution.db;
    const profile = resolution.profile;
    const results = normalizeResults(body);

    if (!results.length) {
      return NextResponse.json({ error: "No se enviaron resultados de ejercicios." }, { status: 400 });
    }

    let xpDelta = 0;
    let streak = Number(profile.current_streak || 0) || 0;
    const output = [];

    for (const row of results) {
      const exerciseId = String(row?.exercise_id || row?.exerciseId || "").trim();
      if (!exerciseId) {
        continue;
      }

      const attempts = toPositiveInteger(row?.attempts, 1);
      const isCorrect = toBoolean(row?.is_correct);

      const { data: existing } = await db
        .from("user_progress")
        .select(
          "id, interval_days, ease_factor, times_seen, times_correct, streak_count"
        )
        .eq("user_id", profile.id)
        .eq("exercise_id", exerciseId)
        .maybeSingle();

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

      const { error: upsertError } = await db
        .from("user_progress")
        .upsert(progressPayload, { onConflict: "user_id,exercise_id" });

      if (upsertError) {
        throw new Error(upsertError.message || "No se pudo actualizar progreso.");
      }

      const gain = calculateXpGain({ isCorrect, attempts });
      xpDelta += gain;
      streak = isCorrect ? streak + 1 : 0;

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

    const updatedXpTotal = (Number(profile.xp_total || 0) || 0) + xpDelta;

    const { error: updateProfileError } = await db
      .from("profiles")
      .update({
        xp_total: updatedXpTotal,
        current_streak: streak,
        last_streak_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (updateProfileError) {
      const fallback = await db
        .from("profiles")
        .update({
          current_streak: streak,
        })
        .eq("id", profile.id);

      if (fallback.error) {
        throw new Error(fallback.error.message || "No se pudo actualizar progreso general del alumno.");
      }
    }

    return NextResponse.json({
      student: {
        id: profile.id,
        student_code: profile.student_code,
        xp_total: updatedXpTotal,
        current_streak: streak,
      },
      results: output,
      totals: {
        processed: output.length,
        xp_delta: xpDelta,
      },
    });
  } catch (error) {
    console.error("POST /api/progress failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo registrar progreso." },
      { status: 500 }
    );
  }
}

