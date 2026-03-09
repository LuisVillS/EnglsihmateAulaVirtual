import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import {
  getLibraryBookReadState,
  getPublishedLibraryBookBySlug,
  listRelatedLibraryBooks,
  recordLibraryReadOpen,
} from "@/lib/library/repository";
import { serializeLibraryReadState } from "@/lib/library/read-state";
import { resolveLibraryReadPayload } from "@/lib/library/source-manager";

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

    await recordLibraryReadOpen({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
    });

    const readState = await getLibraryBookReadState({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
    });
    const serializedState = serializeLibraryReadState(readState);
    const readerPayload = await resolveLibraryReadPayload({
      db: auth.db,
      book,
      allowSourceSync: false,
    });

    console.info("library.read.open", {
      userId: auth.user.id,
      bookId: book.id,
      slug: book.slug,
    });

    const relatedBooks = await listRelatedLibraryBooks({
      db: auth.db,
      book,
      userId: auth.user.id,
      limit: 4,
    });

    return NextResponse.json({
      book,
      reader: readerPayload.reader,
      readState: serializedState,
      relatedBooks,
      sourceSyncError: readerPayload.syncError || "",
    });
  } catch (error) {
    console.error("GET /api/library/books/[slug]/read failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo abrir el lector." },
      { status: 500 }
    );
  }
}
