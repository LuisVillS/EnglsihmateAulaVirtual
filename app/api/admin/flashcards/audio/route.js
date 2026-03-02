import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { ensureElevenLabsAudio } from "@/lib/duolingo/audio-cache";
import { mapLibraryFlashcardRow } from "@/lib/flashcards";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function parseOptionalObject(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid-object");
    }
    return parsed;
  } catch {
    throw new Error("elevenLabsConfig debe ser un objeto JSON valido.");
  }
}

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const flashcardId = cleanText(body.flashcardId || body.id);
    const text = cleanText(body.word || body.text);
    const voiceId = cleanText(body.voiceId || body.voice_id);
    const language = cleanText(body.language || "en") || "en";
    const elevenLabsConfig = parseOptionalObject(body.elevenLabsConfig || body.elevenlabs_config);
    const modelId = cleanText(body.modelId || body.model_id || elevenLabsConfig?.model_id);

    if (!text) {
      return NextResponse.json(
        { error: "La flashcard debe tener word antes de generar audio." },
        { status: 400 }
      );
    }

    const audio = await ensureElevenLabsAudio({
      text,
      language,
      voiceId,
      modelId,
      serviceClient: auth.db,
    });

    const mergedConfig = {
      ...(elevenLabsConfig || {}),
      ...(audio.modelId ? { model_id: audio.modelId } : {}),
    };

    if (flashcardId) {
      const { data, error } = await auth.db
        .from("flashcards")
        .update({
          audio_url: audio.audioUrl || null,
          audio_r2_key: audio.r2Key || null,
          audio_provider: audio.provider || "elevenlabs",
          voice_id: audio.voiceId || voiceId || null,
          elevenlabs_config: Object.keys(mergedConfig).length ? mergedConfig : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", flashcardId)
        .select("id, word, meaning, image_url, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config")
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: error.message || "No se pudo guardar el audio de la flashcard." },
          { status: 400 }
        );
      }

      if (!data?.id) {
        return NextResponse.json(
          { error: "La flashcard ya no existe." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        flashcard: mapLibraryFlashcardRow(data),
        cached: Boolean(audio.cached),
      });
    }

    return NextResponse.json({
      audio: {
        audioUrl: audio.audioUrl || "",
        audioR2Key: audio.r2Key || "",
        audioProvider: audio.provider || "elevenlabs",
        voiceId: audio.voiceId || voiceId || "",
        elevenLabsConfig: Object.keys(mergedConfig).length ? mergedConfig : null,
      },
      cached: Boolean(audio.cached),
    });
  } catch (error) {
    console.error("POST /api/admin/flashcards/audio failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo generar audio con ElevenLabs." },
      { status: 500 }
    );
  }
}
