import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { publishLibraryStagingCandidate } from "@/lib/library/admin";

export async function POST(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const body = await request.json().catch(() => ({}));
    const book = await publishLibraryStagingCandidate({
      db: auth.db,
      stagingId: params?.id,
      overrides: body || {},
    });

    return NextResponse.json({
      book,
    });
  } catch (error) {
    console.error("POST /api/admin/library/publish/[id] failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo publicar el libro." },
      { status: 500 }
    );
  }
}

