import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getLibraryBookReadState, getPublishedLibraryBookBySlug } from "@/lib/library/repository";
import { serializeLibraryReadState } from "@/lib/library/read-state";

export async function GET(request, { params: paramsPromise }) {
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

    const readState = await getLibraryBookReadState({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
    });

    const serializedState = serializeLibraryReadState(readState);

    return NextResponse.json({
      ...serializedState,
      readState: serializedState,
    });
  } catch (error) {
    console.error("GET /api/library/books/[slug]/read-state failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar el estado de lectura." },
      { status: 500 }
    );
  }
}
