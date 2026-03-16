import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { generateLibraryPiperSpeech } from "@/lib/library/piper";
import { getPublishedLibraryBookBySlug } from "@/lib/library/repository";
import { listLibraryBookSources } from "@/lib/library/source-manager";
import { resolveLibraryTtsVoice } from "@/lib/library/tts";
import { verifyFlipbookSessionToken } from "@/lib/flipbook-services/session-token";

export const runtime = "nodejs";

export async function POST(request, { params: paramsPromise }) {
  try {
    const params = await paramsPromise;
    const auth = await requireLibraryStudentRouteAccess();
    if (auth.errorResponse) return auth.errorResponse;
    const body = await request.json().catch(() => ({}));
    const voice = resolveLibraryTtsVoice(body?.voiceId);
    const text = String(body?.text || "").trim();

    if (!text) {
      return NextResponse.json({ error: "No readable text was provided." }, { status: 400 });
    }

    const session = verifyFlipbookSessionToken(body?.sessionToken);
    if (
      session.valid &&
      session.slug === params?.slug &&
      session.ttsEnabled &&
      session.userId === auth.user?.id
    ) {
      const audioBuffer = await generateLibraryPiperSpeech({
        voiceId: voice.id,
        text,
      });

      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "no-store",
          "X-Library-TTS-Voice": voice.label,
        },
      });
    }

    const book = await getPublishedLibraryBookBySlug({
      db: auth.db,
      slug: params?.slug,
      userId: auth.user?.id || "",
    });

    if (!book?.id) {
      return NextResponse.json({ error: "Libro no encontrado." }, { status: 404 });
    }

    const sources = await listLibraryBookSources({ db: auth.db, libraryBookId: book.id, activeOnly: true });
    const manualEpubSource = sources.find(
      (source) =>
        source?.sourceName === "manual_epub" &&
        source?.readable &&
        source?.isPreferredRead
    );

    if (!manualEpubSource?.id) {
      return NextResponse.json(
        { error: "TTS is only available for uploaded EPUB books." },
        { status: 400 }
      );
    }

    const audioBuffer = await generateLibraryPiperSpeech({
      voiceId: voice.id,
      text,
    });

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "X-Library-TTS-Voice": voice.label,
      },
    });
  } catch (error) {
    console.error("POST /api/library/books/[slug]/tts failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo generar el audio de lectura." },
      { status: 500 }
    );
  }
}
