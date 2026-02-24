import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import {
  mapExerciseResponse,
  prepareExercisePayload,
  syncExerciseVocabulary,
} from "@/lib/duolingo/exercises";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeVocabularyIds(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((value) => cleanText(value)).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((value) => cleanText(value))
      .filter(Boolean);
  }
  return [];
}

async function ensureLessonExists(db, lessonId) {
  const { data, error } = await db
    .from("lessons")
    .select("id, status")
    .eq("id", lessonId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo validar lección.");
  }

  return data;
}

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const lessonId = cleanText(body.lesson_id || body.lessonId);

    if (!lessonId) {
      return NextResponse.json({ error: "lesson_id es obligatorio." }, { status: 400 });
    }

    const lesson = await ensureLessonExists(auth.db, lessonId);
    if (!lesson?.id) {
      return NextResponse.json({ error: "La lección no existe." }, { status: 404 });
    }

    const payload = await prepareExercisePayload({
      input: {
        ...body,
        lesson_id: lessonId,
      },
      actorId: auth.user.id,
      db: auth.db,
      forcePublishValidation: true,
    });

    const { data, error } = await auth.db
      .from("exercises")
      .insert({
        ...payload,
        created_by: auth.user.id,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo crear ejercicio." },
        { status: 400 }
      );
    }

    const vocabularyIds = normalizeVocabularyIds(body.vocabulary_ids || body.vocabularyIds);
    if (vocabularyIds.length) {
      await syncExerciseVocabulary({
        db: auth.db,
        exerciseId: data.id,
        vocabularyIds,
      });
    }

    return NextResponse.json({ exercise: mapExerciseResponse(data) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/exercises failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo crear ejercicio." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const exerciseId = cleanText(body.id || body.exercise_id || body.exerciseId);
    if (!exerciseId) {
      return NextResponse.json({ error: "id es obligatorio." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await auth.db
      .from("exercises")
      .select("id, lesson_id, revision")
      .eq("id", exerciseId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message || "No se pudo validar ejercicio." },
        { status: 400 }
      );
    }

    if (!existing?.id) {
      return NextResponse.json({ error: "Ejercicio no encontrado." }, { status: 404 });
    }

    const payload = await prepareExercisePayload({
      input: {
        ...body,
        lesson_id: cleanText(body.lesson_id || body.lessonId) || existing.lesson_id,
        revision: Number(existing.revision || 1) + 1,
      },
      actorId: auth.user.id,
      db: auth.db,
      forcePublishValidation: true,
    });

    const { data, error } = await auth.db
      .from("exercises")
      .update(payload)
      .eq("id", exerciseId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo actualizar ejercicio." },
        { status: 400 }
      );
    }

    if (body.vocabulary_ids || body.vocabularyIds) {
      const vocabularyIds = normalizeVocabularyIds(body.vocabulary_ids || body.vocabularyIds);
      await syncExerciseVocabulary({
        db: auth.db,
        exerciseId,
        vocabularyIds,
      });
    }

    return NextResponse.json({ exercise: mapExerciseResponse(data) });
  } catch (error) {
    console.error("PUT /api/admin/exercises failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar ejercicio." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const exerciseId = cleanText(body.id || searchParams.get("id"));

    if (!exerciseId) {
      return NextResponse.json({ error: "id es obligatorio." }, { status: 400 });
    }

    const { error } = await auth.db.from("exercises").delete().eq("id", exerciseId);
    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo eliminar ejercicio." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/exercises failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo eliminar ejercicio." },
      { status: 500 }
    );
  }
}

