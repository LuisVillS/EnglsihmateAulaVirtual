import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug, setLibraryBookMyLibrary } from "@/lib/library/repository";

function resolveBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

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

    const readState = await setLibraryBookMyLibrary({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
      inMyLibrary: resolveBoolean(body?.inMyLibrary, !book.inMyLibrary),
    });

    return NextResponse.json({
      slug: book.slug,
      bookId: book.id,
      readState,
    });
  } catch (error) {
    console.error("POST /api/library/books/[slug]/my-library failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar My Library." },
      { status: 500 }
    );
  }
}
