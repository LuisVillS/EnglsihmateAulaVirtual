import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { previewLibrarySourceCandidate } from "@/lib/library/admin";

export async function POST(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    if (!body?.candidate) {
      return NextResponse.json({ error: "candidate es obligatorio." }, { status: 400 });
    }

    const preview = await previewLibrarySourceCandidate({
      db: auth.db,
      candidate: body.candidate,
    });

    return NextResponse.json({
      preview,
    });
  } catch (error) {
    console.error("POST /api/admin/library/preview-source failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar la vista previa del libro." },
      { status: 500 }
    );
  }
}
