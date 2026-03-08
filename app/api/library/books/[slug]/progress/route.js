import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug, updateLibraryBookProgress } from "@/lib/library/repository";

export async function POST(request, { params: paramsPromise }) {
  const auth = await requireLibraryStudentRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const body = await request.json().catch(() => ({}));
    const book = await getPublishedLibraryBookBySlug({
      db: auth.db,
      slug: params?.slug,
      userId: auth.user.id,
    });

    if (!book?.id) {
      return NextResponse.json({ error: "Libro no encontrado." }, { status: 404 });
    }

    const readState = await updateLibraryBookProgress({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
      lastPageNumber: body?.lastPageNumber,
      lastLocation: body?.lastLocation,
      progressPercent: body?.progressPercent,
      completed: body?.completed,
    });

    return NextResponse.json({
      slug: book.slug,
      bookId: book.id,
      readState,
    });
  } catch (error) {
    console.error("POST /api/library/books/[slug]/progress failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo guardar el progreso de lectura." },
      { status: 500 }
    );
  }
}
