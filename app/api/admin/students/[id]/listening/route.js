import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { setStudentListeningOverride } from "@/lib/student-skills";

export async function PUT(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const studentId = params?.id?.toString();
    const body = await request.json().catch(() => ({}));

    if (!studentId) {
      return NextResponse.json({ error: "Alumno inválido." }, { status: 400 });
    }

    const result = await setStudentListeningOverride({
      db: auth.db,
      actorId: auth.user?.id || null,
      userId: studentId,
      level: body?.level,
      listeningValue: body?.listening_value ?? body?.listeningValue,
    });

    return NextResponse.json({ listening: result });
  } catch (error) {
    console.error("PUT /api/admin/students/:id/listening failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar listening." },
      { status: 400 }
    );
  }
}
