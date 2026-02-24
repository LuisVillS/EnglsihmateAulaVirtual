import { NextResponse } from "next/server";
import { resolveStudentFromRequest } from "@/lib/duolingo/api-auth";
import { generateStudentSession } from "@/lib/duolingo/session-service";

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

export async function GET(request) {
  try {
    const resolution = await resolveStudentFromRequest({ request });
    if (resolution.errorResponse) {
      return resolution.errorResponse;
    }

    const profile = resolution.profile;
    const exerciseIds = parseExerciseIdsFromRequest(request);
    const session = await generateStudentSession({
      db: resolution.db,
      userId: profile.id,
      now: new Date(),
      exerciseIds,
    });

    return NextResponse.json({
      student: {
        id: profile.id,
        student_code: profile.student_code,
        full_name: profile.full_name,
        xp_total: Number(profile.xp_total || 0) || 0,
        current_streak: Number(profile.current_streak || 0) || 0,
      },
      session,
    });
  } catch (error) {
    console.error("GET /api/session failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo generar la sesión." },
      { status: 500 }
    );
  }
}

