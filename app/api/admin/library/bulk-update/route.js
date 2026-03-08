import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { bulkUpdateLibraryRecords } from "@/lib/library/admin";

export async function PATCH(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids : [];

    if (!ids.length) {
      return NextResponse.json({ error: "ids es obligatorio." }, { status: 400 });
    }

    const result = await bulkUpdateLibraryRecords({
      db: auth.db,
      scope: body?.scope || "staging",
      ids,
      changes: body?.changes || {},
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/admin/library/bulk-update failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar la seleccion." },
      { status: 500 }
    );
  }
}
