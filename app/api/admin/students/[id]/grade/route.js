import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { setStudentAdminGrade } from "@/lib/student-skills";

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

    const result = await setStudentAdminGrade({
      db: auth.db,
      actorId: auth.user?.id || null,
      userId: studentId,
      level: body?.level,
      adminGrade: body?.admin_grade ?? body?.adminGrade,
      comment: body?.comment || "",
    });

    return NextResponse.json({ grade: result });
  } catch (error) {
    console.error("PUT /api/admin/students/:id/grade failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar nota." },
      { status: 400 }
    );
  }
}
