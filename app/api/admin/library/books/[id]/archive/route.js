import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { archiveLibraryBook } from "@/lib/library/admin";

export async function POST(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const book = await archiveLibraryBook({
      db: auth.db,
      id: params?.id,
    });

    return NextResponse.json({ book });
  } catch (error) {
    console.error("POST /api/admin/library/books/[id]/archive failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo archivar el libro." },
      { status: 500 }
    );
  }
}

