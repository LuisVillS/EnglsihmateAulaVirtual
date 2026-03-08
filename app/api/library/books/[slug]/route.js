import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug, listRelatedLibraryBooks } from "@/lib/library/repository";

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

    const relatedBooks = await listRelatedLibraryBooks({
      db: auth.db,
      book,
      userId: auth.user.id,
      limit: 4,
    });

    return NextResponse.json({
      book,
      relatedBooks,
    });
  } catch (error) {
    console.error("GET /api/library/books/[slug] failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar el libro." },
      { status: 500 }
    );
  }
}

