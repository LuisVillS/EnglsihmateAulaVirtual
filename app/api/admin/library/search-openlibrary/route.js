import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { annotateLibrarySourceCandidates } from "@/lib/library/admin";
import { DEFAULT_OPEN_LIBRARY_SEARCH_LIMIT } from "@/lib/library/constants";
import { searchOpenLibraryCatalog } from "@/lib/library/openlibrary";

function candidateSummary(candidate) {
  return {
    ...candidate,
    language_code: candidate.language_code || "",
    readable_online: Boolean(candidate.readable_online),
    preview_only: Boolean(candidate.preview_only),
    borrowable: Boolean(candidate.borrowable),
    importable:
      candidate.language_code === "eng" &&
      candidate.readable_online === true &&
      candidate.preview_only !== true &&
      candidate.ebook_access === "public",
  };
}

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    const limit = Math.max(1, Math.min(60, Number(body?.limit || DEFAULT_OPEN_LIBRARY_SEARCH_LIMIT) || DEFAULT_OPEN_LIBRARY_SEARCH_LIMIT));

    if (!query) {
      return NextResponse.json({ error: "query es obligatorio." }, { status: 400 });
    }

    const candidates = await searchOpenLibraryCatalog({ query, limit });
    const annotatedCandidates = await annotateLibrarySourceCandidates({
      db: auth.db,
      candidates,
    });
    return NextResponse.json({
      candidates: annotatedCandidates.map((candidate) => candidateSummary(candidate)),
      total: annotatedCandidates.length,
    });
  } catch (error) {
    console.error("POST /api/admin/library/search-openlibrary failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo consultar Open Library." },
      { status: 500 }
    );
  }
}
