import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getObjectFromR2 } from "@/lib/r2";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

export async function GET(request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const flashcardId = cleanText(searchParams.get("flashcardId"));
  const fallbackR2Key = cleanText(searchParams.get("r2Key"));

  let audioR2Key = fallbackR2Key;
  let audioUrl = null;

  if (flashcardId) {
    const { data, error } = await supabase
      .from("flashcards")
      .select("id, audio_r2_key, audio_url")
      .eq("id", flashcardId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "No se pudo cargar el audio de la flashcard." },
        { status: 400 }
      );
    }

    if (!data?.id) {
      return NextResponse.json({ error: "Flashcard no encontrada." }, { status: 404 });
    }

    audioR2Key = cleanText(data.audio_r2_key) || audioR2Key;
    audioUrl = cleanText(data.audio_url) || null;
  }

  if (audioR2Key) {
    try {
      const object = await getObjectFromR2(audioR2Key);
      return new NextResponse(Buffer.from(object.bytes), {
        status: 200,
        headers: {
          "Content-Type": object.contentType || "audio/mpeg",
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch (error) {
      return NextResponse.json(
        { error: error?.message || "No se pudo leer el audio desde R2." },
        { status: 500 }
      );
    }
  }

  if (audioUrl) {
    return NextResponse.redirect(audioUrl);
  }

  return NextResponse.json({ error: "La flashcard no tiene audio." }, { status: 404 });
}
