import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { importLibraryCandidateToStaging } from "@/lib/library/admin";

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    if (!body?.candidate) {
      return NextResponse.json({ error: "candidate es obligatorio." }, { status: 400 });
    }

    const stagingCandidate = await importLibraryCandidateToStaging({
      db: auth.db,
      candidate: body.candidate,
      overrides: body.overrides || {},
    });

    return NextResponse.json({
      stagingCandidate,
    });
  } catch (error) {
    console.error("POST /api/admin/library/import-candidate failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo importar el candidato." },
      { status: 500 }
    );
  }
}

