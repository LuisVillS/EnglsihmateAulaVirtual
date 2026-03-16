import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { getPublishedLibraryBookBySlug } from "@/lib/library/repository";
import { resolvePreferredEpubSource, sourceHasReadableEpubAsset } from "@/lib/library/source-manager";
import { getOrCreateFlipbookManifest } from "@/lib/flipbook-services/manifest-cache";
import { loadFlipbookProgress } from "@/lib/flipbook-services/progress-store";
import { createFlipbookSessionToken } from "@/lib/flipbook-services/session-token";
import { resolveInitialCanonicalPageIndex } from "@/lib/flipbook-core/presentation";

export async function GET(request, { params: paramsPromise }) {
  const auth = await requireLibraryStudentRouteAccess();
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

    const manifestPromise = getOrCreateFlipbookManifest({
      db: auth.db,
      book,
      source,
    });
    const userStatePromise = auth.user?.id
      ? loadFlipbookProgress({
          db: auth.db,
          userId: auth.user.id,
          libraryBookId: book.id,
        })
      : Promise.resolve(null);
    const [manifest, userState] = await Promise.all([manifestPromise, userStatePromise]);
    const isCompatibleState =
      userState?.manifestId === manifest.id &&
      userState?.layoutProfileId === manifest.layoutProfileId;
    const state = isCompatibleState
      ? {
          ...userState,
          currentPageIndex:
            userState?.currentPageIndex == null
              ? null
              : Math.min(Math.max(0, Number(userState.currentPageIndex) || 0), Math.max(0, manifest.pageCount - 1)),
          savedPageIndex:
            userState?.savedPageIndex == null
              ? null
              : Math.min(Math.max(0, Number(userState.savedPageIndex) || 0), Math.max(0, manifest.pageCount - 1)),
        }
      : null;
    const requestedPageIndex = request.nextUrl.searchParams.get("p");
    const initialPageIndex = resolveInitialCanonicalPageIndex({
      requestedPageIndex,
      savedPageIndex: state?.savedPageIndex,
      currentPageIndex: state?.currentPageIndex,
      pageCount: manifest.pageCount,
    });
    const ttsEnabled = source?.sourceName === "manual_epub";
    const sessionToken = auth.user?.id
      ? createFlipbookSessionToken({
          userId: auth.user.id,
          libraryBookId: book.id,
          slug: book.slug,
          manifestId: manifest.id,
          layoutProfileId: manifest.layoutProfileId,
          ttsEnabled,
        })
      : "";

    return NextResponse.json({
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        authorDisplay: book.authorDisplay,
        coverUrl: book.coverUrl || "",
        assetUrl: `/api/library/books/${book.slug}/asset?v=${encodeURIComponent(manifest.sourceFingerprint)}`,
      },
      manifest: {
        id: manifest.id,
        layoutProfileId: manifest.layoutProfileId,
        sourceFingerprint: manifest.sourceFingerprint,
        manifestVersion: manifest.manifestVersion,
        metadata: manifest.metadata,
        toc: manifest.toc,
        anchorMap: manifest.anchorMap,
        pageCount: manifest.pageCount,
      },
      state,
      initialPageIndex,
      ttsEnabled,
      session: sessionToken
        ? {
            token: sessionToken,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/library/books/[slug]/flipbook-manifest failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo preparar el flipbook." },
      { status: 500 }
    );
  }
}
