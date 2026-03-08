import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug, saveLibraryBookPlace } from "@/lib/library/repository";
import {
  normalizeLibraryPageCode,
  normalizeLibraryPageNumber,
  serializeLibraryReadState,
} from "@/lib/library/read-state";

export async function POST(request, { params: paramsPromise }) {
  const auth = await requireLibraryStudentRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const body = await request.json().catch(() => ({}));
    const pageNumber = normalizeLibraryPageNumber(body?.pageNumber);
    const pageCode = normalizeLibraryPageCode(typeof body?.pageCode === "string" ? body.pageCode : "");

    if (!pageNumber && !pageCode) {
      return NextResponse.json(
        {
          error: "Se necesita una pagina valida o una posicion detectada del lector.",
          fieldErrors: {
            pageNumber: "Page number must be a positive integer.",
          },
        },
        { status: 400 }
      );
    }

    const book = await getPublishedLibraryBookBySlug({
      db: auth.db,
      slug: params?.slug,
      userId: auth.user.id,
    });

    if (!book?.id) {
      return NextResponse.json({ error: "Libro no encontrado." }, { status: 404 });
    }

    const readState = await saveLibraryBookPlace({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
      pageNumber,
      pageCode: pageCode || null,
    });

    const serializedState = serializeLibraryReadState(readState);

    return NextResponse.json({
      slug: book.slug,
      bookId: book.id,
      ...serializedState,
      readState: serializedState,
    });
  } catch (error) {
    console.error("POST /api/library/books/[slug]/save-place failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo guardar la pagina." },
      { status: 500 }
    );
  }
}
