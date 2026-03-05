import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { setStudentSpeakingOverride } from "@/lib/student-skills";

export async function PUT(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const studentId = params?.id?.toString();
    const body = await request.json().catch(() => ({}));

    if (!studentId) {
      return NextResponse.json({ error: "Alumno invÃ¡lido." }, { status: 400 });
    }

    const result = await setStudentSpeakingOverride({
      db: auth.db,
      actorId: auth.user?.id || null,
      userId: studentId,
      level: body?.level,
      speakingValue: body?.speaking_value ?? body?.speakingValue,
    });

    return NextResponse.json({ speaking: result });
  } catch (error) {
    console.error("PUT /api/admin/students/:id/speaking failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar speaking." },
      { status: 400 }
    );
  }
}
