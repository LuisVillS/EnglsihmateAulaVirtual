import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug } from "@/lib/library/repository";
import {
  loadLibrarySourceAsset,
  resolvePreferredEpubSource,
  sourceHasReadableEpubAsset,
} from "@/lib/library/source-manager";

export async function GET(request, { params: paramsPromise }) {
  const auth = await requireLibraryStudentRouteAccess({
    allowAdmin: true,
    allowGuest: true,
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
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

    const asset = await loadLibrarySourceAsset({
      db: auth.db,
      source,
    });

    return new NextResponse(asset.bytes, {
      headers: {
        "Content-Type": asset.contentType || "application/epub+zip",
        "Content-Disposition": `inline; filename="${book.slug || "book"}.epub"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("GET /api/library/books/[slug]/asset failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar el EPUB." },
      { status: 500 }
    );
  }
}
