import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug } from "@/lib/library/repository";
import { resolvePreferredEpubSource, sourceHasReadableEpubAsset } from "@/lib/library/source-manager";
import { getOrCreateFlipbookManifest } from "@/lib/flipbook-services/manifest-cache";
import { getFlipbookManifestById, listFlipbookPages } from "@/lib/flipbook-services/repository";
import { verifyFlipbookSessionToken } from "@/lib/flipbook-services/session-token";

function readSessionToken(request) {
  return (
    request.headers.get("x-flipbook-session") ||
    request.nextUrl.searchParams.get("sessionToken") ||
    ""
  );
}

export async function GET(request, { params: paramsPromise }) {
  try {
    const params = await paramsPromise;
    const searchParams = request.nextUrl.searchParams;
    const from = Math.max(0, Number(searchParams.get("from")) || 0);
    const to = Math.max(from, Number(searchParams.get("to")) || from + 119);
    const manifestId = String(searchParams.get("manifestId") || "").trim();
    const session = verifyFlipbookSessionToken(readSessionToken(request));
    const auth = await requireLibraryStudentRouteAccess();
    if (auth.errorResponse) return auth.errorResponse;

    if (
      session.valid &&
      session.slug === params?.slug &&
      session.manifestId === manifestId &&
      session.userId === auth.user?.id
    ) {
      const manifest = await getFlipbookManifestById({
        db: auth.db,
        manifestId: session.manifestId,
        includePages: false,
      });
      if (!manifest?.id) {
        return NextResponse.json({ error: "Manifiesto no encontrado." }, { status: 404 });
      }

      const safeTo = Math.min(to, Math.max(0, manifest.pageCount - 1));
      const pages = await listFlipbookPages({
        db: auth.db,
        manifestId: manifest.id,
        from,
        to: safeTo,
      });

      return NextResponse.json({
        manifestId: manifest.id,
        from,
        to: safeTo,
        pages,
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

    const source = await resolvePreferredEpubSource({
      db: auth.db,
      book,
      allowSourceSync: false,
    });
    if (!sourceHasReadableEpubAsset(source)) {
      return NextResponse.json({ error: "No EPUB source available for this book." }, { status: 404 });
    }

    const manifest = await getOrCreateFlipbookManifest({
      db: auth.db,
      book,
      source,
    });
    const safeTo = Math.min(to, Math.max(0, manifest.pageCount - 1));
    const pages = await listFlipbookPages({
      db: auth.db,
      manifestId: manifest.id,
      from,
      to: safeTo,
    });

    return NextResponse.json({
      manifestId: manifest.id,
      from,
      to: safeTo,
      pages,
    });
  } catch (error) {
    console.error("GET /api/library/books/[slug]/flipbook-pages failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudieron cargar las paginas del flipbook." },
      { status: 500 }
    );
  }
}
