import { NextResponse } from "next/server";
import { resolveStudentFromRequest } from "@/lib/duolingo/api-auth";
import { normalizeFlashcardGameMode } from "@/lib/flashcard-arcade/constants";
import {
  buildFlashcardProgressUpdate,
  calculateFlashcardAccuracyPercent,
  calculateFlashcardSessionXp,
  normalizeFlashcardProgressRow,
} from "@/lib/flashcard-arcade/progress";
import { applyGamificationDelta } from "@/lib/gamification/mutations";
import { recordCompetitionActivity } from "@/lib/competition/service";

function toPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeCardResults(body) {
  if (!Array.isArray(body?.cards)) return [];
  return body.cards
    .map((row) => ({
      flashcardId: String(row?.flashcard_id || row?.flashcardId || "").trim(),
      seenCount: Math.max(0, Number(row?.seen_count ?? row?.seenCount ?? 0) || 0),
      correctCount: Math.max(0, Number(row?.correct_count ?? row?.correctCount ?? 0) || 0),
      incorrectCount: Math.max(0, Number(row?.incorrect_count ?? row?.incorrectCount ?? 0) || 0),
      responseMs: row?.response_ms == null ? null : Math.max(0, Number(row.response_ms) || 0),
      eventType: String(row?.event_type || row?.eventType || "").trim().toLowerCase(),
      payload: toPlainObject(row?.payload),
    }))
    .filter((row) => row.flashcardId);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolution = await resolveStudentFromRequest({ request, body });
    if (resolution.errorResponse) {
      return resolution.errorResponse;
    }

    const gameSessionId = String(body?.game_session_id || body?.gameSessionId || "").trim();
    const mode = normalizeFlashcardGameMode(body?.mode);
    const score = Math.max(0, Number(body?.score || 0) || 0);
    const comboMax = Math.max(0, Number(body?.combo_max ?? body?.comboMax ?? 0) || 0);
    const durationSec =
      body?.duration_sec == null && body?.durationSec == null
        ? null
        : Math.max(0, Number(body?.duration_sec ?? body?.durationSec ?? 0) || 0);
    const livesLeft =
      body?.lives_left == null && body?.livesLeft == null
        ? null
        : Math.max(0, Number(body?.lives_left ?? body?.livesLeft ?? 0) || 0);
    const completed = body?.completed !== false;
    const cards = normalizeCardResults(body);

    if (!gameSessionId) {
      return NextResponse.json({ error: "Falta game_session_id." }, { status: 400 });
    }

    const { data: gameSession, error: gameSessionError } = await resolution.db
      .from("flashcard_game_sessions")
      .select("id, user_id, status, deck_key, deck_title, mode, total_cards")
      .eq("id", gameSessionId)
      .eq("user_id", resolution.profile.id)
      .maybeSingle();

    if (gameSessionError) {
      throw new Error(gameSessionError.message || "No se pudo cargar la sesion de flashcards.");
    }

    if (!gameSession?.id) {
      return NextResponse.json({ error: "Sesion de flashcards no encontrada." }, { status: 404 });
    }

    if (gameSession.status === "completed") {
      return NextResponse.json({
        alreadyRecorded: true,
      });
    }

    const flashcardIds = Array.from(new Set(cards.map((row) => row.flashcardId)));
    let existingById = new Map();
    if (flashcardIds.length) {
      const { data: existingProgressRows, error: progressError } = await resolution.db
        .from("user_flashcard_progress")
        .select("*")
        .eq("user_id", resolution.profile.id)
        .in("flashcard_id", flashcardIds);

      if (progressError) {
        throw new Error(progressError.message || "No se pudo cargar el progreso actual de flashcards.");
      }

      existingById = new Map(
        (existingProgressRows || [])
          .map((row) => normalizeFlashcardProgressRow(row))
          .filter((row) => row.flashcardId)
          .map((row) => [row.flashcardId, row])
      );
    }

    const nowIso = new Date().toISOString();
    const upserts = cards.map((row) => {
      const current = existingById.get(row.flashcardId) || null;
      const next = buildFlashcardProgressUpdate(current, {
        seenCount: row.seenCount,
        correctCount: row.correctCount,
        incorrectCount: row.incorrectCount,
      });

      return {
        user_id: resolution.profile.id,
        flashcard_id: row.flashcardId,
        seen_count: next.seenCount,
        correct_count: next.correctCount,
        incorrect_count: next.incorrectCount,
        mastery_score: next.masteryScore,
        mastery_stage: next.masteryStage,
        last_game_mode: mode,
        last_practiced_at: nowIso,
        updated_at: nowIso,
      };
    });

    if (upserts.length) {
      const { error: upsertError } = await resolution.db
        .from("user_flashcard_progress")
        .upsert(upserts, { onConflict: "user_id,flashcard_id" });

      if (upsertError) {
        throw new Error(upsertError.message || "No se pudo guardar el progreso de flashcards.");
      }
    }

    const totalPrompts = cards.reduce(
      (sum, row) => sum + Math.max(0, row.seenCount || row.correctCount + row.incorrectCount),
      0
    );
    const correctAnswers = cards.reduce((sum, row) => sum + row.correctCount, 0);
    const incorrectAnswers = cards.reduce((sum, row) => sum + row.incorrectCount, 0);
    const accuracyPercent = calculateFlashcardAccuracyPercent({
      totalPrompts,
      correctAnswers,
    });
    const xpSummary = calculateFlashcardSessionXp({
      mode,
      totalPrompts,
      correctAnswers,
      completed,
      comboMax,
      uniqueCards: flashcardIds.length,
    });

    const eventRows = cards.map((row) => ({
      game_session_id: gameSession.id,
      flashcard_id: row.flashcardId,
      event_type:
        row.eventType ||
        (row.correctCount > 0 ? "correct" : row.incorrectCount > 0 ? "incorrect" : "seen"),
      is_correct: row.correctCount > 0 ? true : row.incorrectCount > 0 ? false : null,
      response_ms: row.responseMs,
      xp_earned: 0,
      payload: {
        ...row.payload,
        seen_count: row.seenCount,
        correct_count: row.correctCount,
        incorrect_count: row.incorrectCount,
      },
    }));

    if (eventRows.length) {
      const { error: eventError } = await resolution.db
        .from("flashcard_game_events")
        .insert(eventRows);

      if (eventError) {
        throw new Error(eventError.message || "No se pudo registrar el historial de flashcards.");
      }
    }

    const { error: sessionUpdateError } = await resolution.db
      .from("flashcard_game_sessions")
      .update({
        mode,
        status: completed ? "completed" : "abandoned",
        total_prompts: totalPrompts,
        correct_answers: correctAnswers,
        incorrect_answers: incorrectAnswers,
        accuracy_rate: accuracyPercent,
        xp_earned: xpSummary.xpEarned,
        score,
        combo_max: comboMax,
        lives_left: livesLeft,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", gameSession.id)
      .eq("user_id", resolution.profile.id);

    if (sessionUpdateError) {
      throw new Error(sessionUpdateError.message || "No se pudo cerrar la sesion de flashcards.");
    }

    let gamification = await applyGamificationDelta(resolution.db, {
      userId: resolution.profile.id,
      legacyXpTotal: Number(resolution.profile?.xp_total || 0) || 0,
      xpDelta: xpSummary.xpEarned,
      flashcardXpDelta: xpSummary.xpEarned,
      stats: completed
        ? {
            flashcardSessionsCompleted: 1,
          }
        : {},
    });

    let competition = null;
    if (completed) {
      const competitionResult = await recordCompetitionActivity(resolution.db, {
        userId: resolution.profile.id,
        legacyXpTotal: gamification.lifetimeXp,
        activity: {
          source: "flashcards",
          mode,
          xpEarned: xpSummary.xpEarned,
          totalPrompts,
          correctAnswers,
          accuracyPercent,
          durationSec,
        },
      });

      gamification = competitionResult.gamification || gamification;
      competition = competitionResult.competition;
    }

    return NextResponse.json({
      gamification,
      competition,
      session: {
        id: gameSession.id,
        deckKey: gameSession.deck_key || "",
        deckTitle: gameSession.deck_title || "Flashcards",
        mode,
        score,
        accuracyPercent,
        totalPrompts,
        correctAnswers,
        incorrectAnswers,
        xpEarned: xpSummary.xpEarned,
        comboMax,
        livesLeft,
        durationSec,
        completed,
      },
    });
  } catch (error) {
    console.error("POST /api/flashcards/arcade/progress failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo registrar el progreso de flashcards." },
      { status: 500 }
    );
  }
}
