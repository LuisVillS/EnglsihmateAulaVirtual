import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { publishLibraryStagingCandidatesBulk } from "@/lib/library/admin";

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const stagingIds = Array.isArray(body?.stagingIds) ? body.stagingIds : [];

    if (!stagingIds.length) {
      return NextResponse.json({ error: "stagingIds es obligatorio." }, { status: 400 });
    }

    const result = await publishLibraryStagingCandidatesBulk({
      db: auth.db,
      stagingIds,
      overrides: body?.overrides || {},
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/admin/library/publish-bulk failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo publicar la seleccion." },
      { status: 500 }
    );
  }
}
