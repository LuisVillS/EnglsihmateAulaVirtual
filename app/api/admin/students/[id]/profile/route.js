import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { loadTeacherStudentProfile } from "@/lib/student-skills";

function toStatusCode(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("no encontrado")) return 404;
  if (message.includes("inválido") || message.includes("invalido")) return 400;
  return 500;
}

export async function GET(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const studentId = params?.id?.toString();

    const data = await loadTeacherStudentProfile({
      db: auth.db,
      studentId,
    });

    return NextResponse.json(data);
  } catch (error) {
    const status = toStatusCode(error);
    console.error("GET /api/admin/students/:id/profile failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar perfil del alumno." },
      { status }
    );
  }
}
