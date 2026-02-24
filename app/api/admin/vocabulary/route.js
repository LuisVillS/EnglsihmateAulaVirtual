import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { ensureElevenLabsAudio } from "@/lib/duolingo/audio-cache";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function buildPayload(body, actorId) {
  return {
    word_target: cleanText(body.word_target || body.wordTarget),
    word_native: cleanText(body.word_native || body.wordNative),
    category: cleanText(body.category) || null,
    language_pair: cleanText(body.language_pair || body.languagePair) || null,
    level: cleanText(body.level) || null,
    tags: normalizeTags(body.tags),
    image_url: cleanText(body.image_url || body.imageUrl) || null,
    audio_url: cleanText(body.audio_url || body.audioUrl) || null,
    status: cleanText(body.status || "draft").toLowerCase() || "draft",
    updated_at: new Date().toISOString(),
    updated_by: actorId || null,
  };
}

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const payload = buildPayload(body, auth.user.id);

    if (!payload.word_target || !payload.word_native) {
      return NextResponse.json(
        { error: "word_target y word_native son obligatorios." },
        { status: 400 }
      );
    }

    if (body.generate_audio && !payload.audio_url) {
      const audio = await ensureElevenLabsAudio({
        text: payload.word_target,
        language: cleanText(body.language || "en"),
        voiceId: cleanText(body.voice_id || body.voiceId),
        modelId: cleanText(body.model_id || body.modelId),
        serviceClient: auth.db,
      });

      payload.audio_url = audio.audioUrl || null;
      payload.audio_key = audio.audioKey || null;
      payload.audio_provider = audio.provider || "elevenlabs";
      payload.audio_voice_id = cleanText(body.voice_id || body.voiceId) || null;
      payload.audio_model = cleanText(body.model_id || body.modelId) || null;
    }

    const insertPayload = {
      ...payload,
      created_by: auth.user.id,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await auth.db
      .from("vocabulary")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo crear vocabulario." },
        { status: 400 }
      );
    }

    return NextResponse.json({ vocabulary: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/vocabulary failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo crear vocabulario." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const id = cleanText(body.id);

    if (!id) {
      return NextResponse.json({ error: "id es obligatorio." }, { status: 400 });
    }

    const payload = buildPayload(body, auth.user.id);

    if (body.generate_audio && !payload.audio_url) {
      const sourceText = payload.word_target || cleanText(body.text_for_audio || body.textForAudio);
      if (sourceText) {
        const audio = await ensureElevenLabsAudio({
          text: sourceText,
          language: cleanText(body.language || "en"),
          voiceId: cleanText(body.voice_id || body.voiceId),
          modelId: cleanText(body.model_id || body.modelId),
          serviceClient: auth.db,
        });

        payload.audio_url = audio.audioUrl || null;
        payload.audio_key = audio.audioKey || null;
        payload.audio_provider = audio.provider || "elevenlabs";
        payload.audio_voice_id = cleanText(body.voice_id || body.voiceId) || null;
        payload.audio_model = cleanText(body.model_id || body.modelId) || null;
      }
    }

    const { data, error } = await auth.db
      .from("vocabulary")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo actualizar vocabulario." },
        { status: 400 }
      );
    }

    return NextResponse.json({ vocabulary: data });
  } catch (error) {
    console.error("PUT /api/admin/vocabulary failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar vocabulario." },
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
    const id = cleanText(body.id || searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ error: "id es obligatorio." }, { status: 400 });
    }

    const { error } = await auth.db.from("vocabulary").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo eliminar vocabulario." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/vocabulary failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo eliminar vocabulario." },
      { status: 500 }
    );
  }
}

