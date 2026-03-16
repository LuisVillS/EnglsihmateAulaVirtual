import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug } from "@/lib/library/repository";
import { saveFlipbookProgress } from "@/lib/flipbook-services/progress-store";
import { verifyFlipbookSessionToken } from "@/lib/flipbook-services/session-token";

export async function POST(request, { params: paramsPromise }) {
  try {
    const params = await paramsPromise;
    const auth = await requireLibraryStudentRouteAccess();
    if (auth.errorResponse) return auth.errorResponse;
    const body = await request.json().catch(() => ({}));
    const session = verifyFlipbookSessionToken(body?.sessionToken);

    if (
      session.valid &&
      session.slug === params?.slug &&
      session.manifestId === body?.manifestId &&
      session.userId === auth.user?.id
    ) {
      const state = await saveFlipbookProgress({
        db: auth.db,
        userId: session.userId,
        libraryBookId: session.libraryBookId,
        layoutProfileId: body?.layoutProfileId || session.layoutProfileId,
        manifestId: body?.manifestId || session.manifestId,
        currentPageId: body?.currentPageId,
        currentPageIndex: body?.currentPageIndex,
        progressPercent: body?.progressPercent,
        chapterId: body?.chapterId,
        startedReading: true,
        completed: Boolean(body?.completed),
      });

      return NextResponse.json({
        slug: params?.slug,
        state,
      });
    }

    const book = await getPublishedLibraryBookBySlug({
      db: auth.db,
      slug: params?.slug,
      userId: auth.user.id,
    });
    if (!book?.id) {
      return NextResponse.json({ error: "Libro no encontrado." }, { status: 404 });
    }

    const state = await saveFlipbookProgress({
      db: auth.db,
      userId: auth.user.id,
      libraryBookId: book.id,
      layoutProfileId: body?.layoutProfileId,
      manifestId: body?.manifestId,
      currentPageId: body?.currentPageId,
      currentPageIndex: body?.currentPageIndex,
      progressPercent: body?.progressPercent,
      chapterId: body?.chapterId,
      startedReading: true,
      completed: Boolean(body?.completed),
    });

    return NextResponse.json({
      slug: book.slug,
      state,
    });
  } catch (error) {
    console.error("POST /api/library/books/[slug]/flipbook-progress failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo guardar el progreso del flipbook." },
      { status: 500 }
    );
  }
}
