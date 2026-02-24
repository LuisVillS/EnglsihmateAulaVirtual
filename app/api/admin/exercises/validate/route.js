import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { validateExerciseContent } from "@/lib/duolingo/validation";

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const result = validateExerciseContent({
      type: body?.type,
      contentJson: body?.content_json,
    });

    return NextResponse.json({
      valid: result.valid,
      errors: result.errors,
      normalized: {
        type: result.normalizedType,
        content_json: result.normalizedContent,
      },
    });
  } catch (error) {
    console.error("POST /api/admin/exercises/validate failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo validar ejercicio." },
      { status: 500 }
    );
  }
}

