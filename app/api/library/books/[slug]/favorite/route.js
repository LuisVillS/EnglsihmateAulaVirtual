import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug, setLibraryFavorite } from "@/lib/library/repository";

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

    const nextFavorite =
      body?.favorite == null
        ? !book.favorite
        : ["1", "true", "yes", "on"].includes(String(body.favorite).toLowerCase());

    const favorite = await setLibraryFavorite({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
      favorite: nextFavorite,
    });

    return NextResponse.json({
      favorite,
      bookId: book.id,
      slug: book.slug,
    });
  } catch (error) {
    console.error("POST /api/library/books/[slug]/favorite failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar favorito." },
      { status: 500 }
    );
  }
}

