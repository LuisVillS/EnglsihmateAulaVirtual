import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { importLibraryCandidatesBulk } from "@/lib/library/admin";

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const candidates = Array.isArray(body?.candidates) ? body.candidates : [];

    if (!candidates.length) {
      return NextResponse.json({ error: "candidates es obligatorio." }, { status: 400 });
    }

    const result = await importLibraryCandidatesBulk({
      db: auth.db,
      candidates,
      overrides: body?.overrides || {},
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/admin/library/import-bulk failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo importar la seleccion." },
      { status: 500 }
    );
  }
}
