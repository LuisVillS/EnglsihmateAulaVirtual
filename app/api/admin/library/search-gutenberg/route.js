import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { annotateLibrarySourceCandidates } from "@/lib/library/admin";
import { DEFAULT_GUTENBERG_SEARCH_LIMIT } from "@/lib/library/constants";
import { searchGutenbergCatalog } from "@/lib/library/gutenberg";

function candidateSummary(candidate) {
  return {
    ...candidate,
    language_code: candidate.language_code || "",
    source_name: candidate.source_name || "gutenberg",
  };
}

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    const limit = Math.max(
      1,
      Math.min(60, Number(body?.limit || DEFAULT_GUTENBERG_SEARCH_LIMIT) || DEFAULT_GUTENBERG_SEARCH_LIMIT)
    );

    if (!query) {
      return NextResponse.json({ error: "query es obligatorio." }, { status: 400 });
    }

    const candidates = await searchGutenbergCatalog({ query, limit });
    const annotatedCandidates = await annotateLibrarySourceCandidates({
      db: auth.db,
      candidates,
    });

    return NextResponse.json({
      candidates: annotatedCandidates.map((candidate) => candidateSummary(candidate)),
      total: annotatedCandidates.length,
    });
  } catch (error) {
    console.error("POST /api/admin/library/search-gutenberg failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo consultar Gutenberg API." },
      { status: 500 }
    );
  }
}
