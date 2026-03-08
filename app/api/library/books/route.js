import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { listPublishedLibraryBooks } from "@/lib/library/repository";

function getFiltersFromRequest(request) {
  const { searchParams } = new URL(request.url);
  return {
    q: searchParams.get("q") || "",
    cefrLevel: searchParams.get("cefr") || searchParams.get("cefrLevel") || "",
    category: searchParams.get("category") || "",
    tag: searchParams.get("tag") || "",
  };
}

export async function GET(request) {
  const auth = await requireLibraryStudentRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const books = await listPublishedLibraryBooks({
      db: auth.db,
      userId: auth.user.id,
      filters: getFiltersFromRequest(request),
    });

    return NextResponse.json({
      books,
      total: books.length,
    });
  } catch (error) {
    console.error("GET /api/library/books failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar la biblioteca." },
      { status: 500 }
    );
  }
}
