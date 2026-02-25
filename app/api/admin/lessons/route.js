import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { validateLessonPublishable } from "@/lib/duolingo/validation";
import { runExerciseGarbageCollection } from "@/lib/duolingo/exercise-lifecycle";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function toInteger(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return rounded < 1 ? fallback : rounded;
}

async function ensureUnitId(db) {
  const { data: existingUnit } = await db
    .from("units")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingUnit?.id) return existingUnit.id;

  const slug = `duolingo-core-${Date.now()}`;
  const { data: course, error: courseError } = await db
    .from("courses")
    .insert({
      slug,
      title: "Duolingo-like Core",
      level: "A1",
      description: "Generated default container for the Course Content Editor.",
    })
    .select("id")
    .single();

  if (courseError || !course?.id) {
    throw new Error(courseError?.message || "No se pudo crear curso base para lecciones.");
  }

  const { data: unit, error: unitError } = await db
    .from("units")
    .insert({
      course_id: course.id,
      title: "Core Unit",
      position: 1,
    })
    .select("id")
    .single();

  if (unitError || !unit?.id) {
    throw new Error(unitError?.message || "No se pudo crear unidad base para lecciones.");
  }

  return unit.id;
}

async function loadLessonExercises(db, lessonId) {
  const { data, error } = await db
    .from("exercises")
    .select("id, type, status, content_json")
    .eq("lesson_id", lessonId)
    .in("status", ["draft", "published", "archived"])
    .order("ordering", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar ejercicios de la leccion.");
  }

  return data || [];
}

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const status = cleanText(body.status || "draft").toLowerCase() || "draft";

    if (status === "published") {
      return NextResponse.json(
        { error: "Crea la leccion en draft primero y publicala despues de validar ejercicios." },
        { status: 400 }
      );
    }

    const unitId = cleanText(body.unit_id || body.unitId) || (await ensureUnitId(auth.db));

    const payload = {
      unit_id: unitId,
      subject_id: cleanText(body.subject_id || body.subjectId) || null,
      title: cleanText(body.title),
      description: cleanText(body.description) || null,
      level: cleanText(body.level) || null,
      ordering: toInteger(body.ordering, 1),
      position: toInteger(body.ordering, 1),
      status,
      created_by: auth.user.id,
      updated_by: auth.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!payload.title) {
      return NextResponse.json({ error: "title es obligatorio." }, { status: 400 });
    }

    const { data, error } = await auth.db
      .from("lessons")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo crear leccion." },
        { status: 400 }
      );
    }

    return NextResponse.json({ lesson: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/lessons failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo crear leccion." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const lessonId = cleanText(body.id || body.lesson_id || body.lessonId);
    if (!lessonId) {
      return NextResponse.json({ error: "id es obligatorio." }, { status: 400 });
    }

    const status = cleanText(body.status || "draft").toLowerCase() || "draft";

    const payload = {
      subject_id: cleanText(body.subject_id || body.subjectId) || null,
      title: cleanText(body.title),
      description: cleanText(body.description) || null,
      level: cleanText(body.level) || null,
      ordering: toInteger(body.ordering, 1),
      position: toInteger(body.ordering, 1),
      status,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    };

    if (!payload.title) {
      return NextResponse.json({ error: "title es obligatorio." }, { status: 400 });
    }

    if (status === "published") {
      const exercises = await loadLessonExercises(auth.db, lessonId);
      const validation = validateLessonPublishable(
        {
          id: lessonId,
          title: payload.title,
        },
        exercises
      );

      if (!validation.valid) {
        return NextResponse.json(
          {
            error: "No se puede publicar la leccion: ejercicios incompletos.",
            details: validation.errors,
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await auth.db
      .from("lessons")
      .update(payload)
      .eq("id", lessonId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo actualizar leccion." },
        { status: 400 }
      );
    }

    return NextResponse.json({ lesson: data });
  } catch (error) {
    console.error("PUT /api/admin/lessons failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar leccion." },
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
    const lessonId = cleanText(body.id || searchParams.get("id"));

    if (!lessonId) {
      return NextResponse.json({ error: "id es obligatorio." }, { status: 400 });
    }

    const actorId = auth.user?.id || null;
    const { error } = await auth.db
      .from("lessons")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", lessonId);
    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo archivar leccion." },
        { status: 400 }
      );
    }

    const { error: archiveExercisesError } = await auth.db
      .from("exercises")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
        updated_by: actorId,
        last_editor: actorId,
      })
      .eq("lesson_id", lessonId)
      .in("status", ["draft", "published"]);

    if (archiveExercisesError) {
      return NextResponse.json(
        { error: archiveExercisesError.message || "No se pudieron archivar ejercicios." },
        { status: 400 }
      );
    }

    await runExerciseGarbageCollection({ db: auth.db, actorId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/lessons failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo archivar leccion." },
      { status: 500 }
    );
  }
}
