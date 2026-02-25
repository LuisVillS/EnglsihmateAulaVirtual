import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { loadTeacherStudentsOverview } from "@/lib/student-skills";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

export async function GET(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const data = await loadTeacherStudentsOverview({
      db: auth.db,
      filters: {
        commissionId:
          cleanText(searchParams.get("commission")) ||
          cleanText(searchParams.get("commission_id")) ||
          cleanText(searchParams.get("commissionId")),
        level: cleanText(searchParams.get("level")),
        query: cleanText(searchParams.get("q")),
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/students failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar alumnos del dashboard." },
      { status: 500 }
    );
  }
}
