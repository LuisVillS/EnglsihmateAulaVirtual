import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { clearLibraryBookPlace, getPublishedLibraryBookBySlug } from "@/lib/library/repository";
import { serializeLibraryReadState } from "@/lib/library/read-state";

export async function POST(request, { params: paramsPromise }) {
  const auth = await requireLibraryStudentRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const book = await getPublishedLibraryBookBySlug({
      db: auth.db,
      slug: params?.slug,
      userId: auth.user.id,
    });

    if (!book?.id) {
      return NextResponse.json({ error: "Libro no encontrado." }, { status: 404 });
    }

    const readState = await clearLibraryBookPlace({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
    });

    const serializedState = serializeLibraryReadState(readState);

    return NextResponse.json({
      slug: book.slug,
      bookId: book.id,
      ...serializedState,
      readState: serializedState,
    });
  } catch (error) {
    console.error("POST /api/library/books/[slug]/clear-place failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo borrar la pagina guardada." },
      { status: 500 }
    );
  }
}
