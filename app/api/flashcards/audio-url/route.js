import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSignedDownloadUrl } from "@/lib/r2";

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
  const directR2Key = cleanText(searchParams.get("r2Key"));

  let audioUrl = null;
  let audioR2Key = directR2Key;

  if (flashcardId) {
    const { data, error } = await supabase
      .from("flashcards")
      .select("id, audio_url, audio_r2_key")
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

    audioUrl = cleanText(data.audio_url) || null;
    audioR2Key = cleanText(data.audio_r2_key) || audioR2Key;
  }

  if (audioR2Key) {
    try {
      const signedUrl = await getSignedDownloadUrl(audioR2Key);
      return NextResponse.json({ audioUrl: signedUrl, source: "signed-r2" });
    } catch (error) {
      return NextResponse.json(
        { error: error?.message || "No se pudo firmar el audio." },
        { status: 500 }
      );
    }
  }

  if (audioUrl) {
    return NextResponse.json({ audioUrl, source: "stored-url" });
  }

  return NextResponse.json({ audioUrl: null, source: "none" });
}
