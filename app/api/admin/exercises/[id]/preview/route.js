import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { resolveAudioUrlFromContent } from "@/lib/duolingo/audio-cache";
import { toPreviewModel } from "@/lib/duolingo/validation";

export async function GET(request, { params }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const exerciseId = params?.id?.toString();
    if (!exerciseId) {
      return NextResponse.json({ error: "id inválido." }, { status: 400 });
    }

    const { data, error } = await auth.db
      .from("exercises")
      .select(
        `
        id,
        lesson_id,
        type,
        status,
        ordering,
        content_json,
        payload,
        lesson:lessons (
          id,
          title,
          level
        ),
        vocabulary_links:exercise_vocabulary (
          vocab:vocabulary (
            id,
            word_target,
            word_native,
            category,
            image_url,
            audio_url
          )
        )
      `
      )
      .eq("id", exerciseId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo cargar preview." },
        { status: 400 }
      );
    }

    if (!data?.id) {
      return NextResponse.json({ error: "Ejercicio no encontrado." }, { status: 404 });
    }

    const preview = toPreviewModel(data);

    if (preview.type === "audio_match") {
      const signed = await resolveAudioUrlFromContent(preview.content);
      if (signed && !preview.content.audio_url) {
        preview.content.audio_url = signed;
      }
    }

    const vocabulary = (data.vocabulary_links || [])
      .map((item) => item?.vocab)
      .filter(Boolean);

    return NextResponse.json({
      exercise: {
        ...preview,
        lesson: data.lesson,
      },
      vocabulary,
    });
  } catch (error) {
    console.error("GET /api/admin/exercises/:id/preview failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo generar preview." },
      { status: 500 }
    );
  }
}

