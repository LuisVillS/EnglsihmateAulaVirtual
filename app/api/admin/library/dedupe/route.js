import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { runLibraryDedupe } from "@/lib/library/admin";

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const result = await runLibraryDedupe({
      db: auth.db,
      canonicalId: body?.canonicalId || "",
      duplicateIds: Array.isArray(body?.duplicateIds) ? body.duplicateIds : [],
      stagingIds: Array.isArray(body?.stagingIds) ? body.stagingIds : [],
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/admin/library/dedupe failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo ejecutar la deduplicacion." },
      { status: 500 }
    );
  }
}

