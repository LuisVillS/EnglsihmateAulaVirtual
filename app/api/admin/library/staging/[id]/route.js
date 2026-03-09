import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { getLibraryStagingCandidateById } from "@/lib/library/repository";
import { deleteLibraryStagingCandidate, updateLibraryStagingCandidate } from "@/lib/library/admin";

export async function GET(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const stagingCandidate = await getLibraryStagingCandidateById({
      db: auth.db,
      id: params?.id,
    });

    if (!stagingCandidate?.id) {
      return NextResponse.json({ error: "Candidato no encontrado." }, { status: 404 });
    }

    return NextResponse.json({ stagingCandidate });
  } catch (error) {
    console.error("GET /api/admin/library/staging/[id] failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar staging." },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const body = await request.json().catch(() => ({}));
    const stagingCandidate = await updateLibraryStagingCandidate({
      db: auth.db,
      id: params?.id,
      changes: body || {},
    });

    return NextResponse.json({ stagingCandidate });
  } catch (error) {
    console.error("PATCH /api/admin/library/staging/[id] failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar staging." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    await deleteLibraryStagingCandidate({
      db: auth.db,
      id: params?.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/library/staging/[id] failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo eliminar staging." },
      { status: 500 }
    );
  }
}
