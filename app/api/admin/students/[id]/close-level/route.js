import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { closeStudentLevel } from "@/lib/student-skills";

export async function POST(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const studentId = params?.id?.toString();
    const body = await request.json().catch(() => ({}));

    if (!studentId) {
      return NextResponse.json({ error: "Alumno inválido." }, { status: 400 });
    }

    const snapshot = await closeStudentLevel({
      db: auth.db,
      actorId: auth.user?.id || null,
      userId: studentId,
      level: body?.level,
      startedAt: body?.started_at || body?.startedAt || null,
      completedAt: body?.completed_at || body?.completedAt || null,
      notes: body?.notes || "",
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    console.error("POST /api/admin/students/:id/close-level failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cerrar nivel." },
      { status: 400 }
    );
  }
}
