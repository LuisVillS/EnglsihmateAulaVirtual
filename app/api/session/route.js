import { NextResponse } from "next/server";
import { resolveStudentFromRequest } from "@/lib/duolingo/api-auth";
import { normalizeSessionSize, normalizeTimedSeconds } from "@/lib/duolingo/practice-config";
import { ensureGamificationProfile } from "@/lib/gamification/profile";
import { generateStudentSession } from "@/lib/duolingo/session-service";
import { normalizeStudentCefrLevel } from "@/lib/student-levels";
import { withSupabaseRequestTrace } from "@/lib/supabase-tracing";

function parseExerciseIdsFromRequest(request) {
  const { searchParams } = new URL(request.url);
  const directIds = searchParams.getAll("exercise_id");
  const csv = searchParams.get("exercise_ids");
  const csvIds = csv
    ? csv.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  return Array.from(
    new Set(
      [...directIds, ...csvIds]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function parseSessionOptions(request) {
  const { searchParams } = new URL(request.url);
  const mode = String(searchParams.get("mode") || "").trim();
  const size = normalizeSessionSize(searchParams.get("size") || searchParams.get("items"), 12);
  const timeLimitRaw =
    searchParams.get("time_limit_sec") ||
    searchParams.get("timed_seconds") ||
    searchParams.get("time_limit");

  return {
    mode,
    size,
    timeLimitSec: mode === "timed" ? normalizeTimedSeconds(timeLimitRaw, 180) : null,
    sourceContext: String(searchParams.get("source") || "").trim() || "practice_arena",
    filters: {
      skill: searchParams.get("skill") || "",
      cefrLevel: searchParams.get("cefr") || searchParams.get("cefrLevel") || "",
      categoryId: searchParams.get("category_id") || searchParams.get("categoryId") || "",
      theme: searchParams.get("theme") || "",
      scenario: searchParams.get("scenario") || "",
    },
  };
}

export async function GET(request) {
  return withSupabaseRequestTrace("api:GET /api/session", async () => {
    try {
      const resolution = await resolveStudentFromRequest({ request });
      if (resolution.errorResponse) {
        return resolution.errorResponse;
      }

      const profile = resolution.profile;
      const exerciseIds = parseExerciseIdsFromRequest(request);
      const sessionOptions = parseSessionOptions(request);
      const allowedCefrLevel = normalizeStudentCefrLevel(profile?.course_level);
      const gamification = await ensureGamificationProfile(resolution.db, {
        userId: profile.id,
        legacyXpTotal: profile.xp_total,
      });

      const session = await generateStudentSession({
        db: resolution.db,
        userId: profile.id,
        now: new Date(),
        exerciseIds,
        options: {
          ...sessionOptions,
          allowedCefrLevel,
        },
      });

      return NextResponse.json({
        student: {
          id: profile.id,
          student_code: profile.student_code,
          full_name: profile.full_name,
          course_level: profile.course_level || "",
          cefr_level: allowedCefrLevel,
          xp_total: gamification.lifetimeXp,
          current_streak: Number(profile.current_streak || 0) || 0,
        },
        gamification,
        session,
      });
    } catch (error) {
      console.error("GET /api/session failed", error);
      return NextResponse.json(
        { error: error?.message || "No se pudo generar la sesion." },
        { status: 500 }
      );
    }
  });
}
