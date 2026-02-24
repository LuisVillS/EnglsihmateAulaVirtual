import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { loadTeacherDashboardData } from "@/lib/duolingo/teacher-analytics";

export async function GET(request) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const data = await loadTeacherDashboardData({
      db: auth.db,
      filters: {
        from: searchParams.get("from"),
        to: searchParams.get("to"),
        level: searchParams.get("level"),
        commissionId: searchParams.get("commission_id") || searchParams.get("commissionId"),
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/teacher-dashboard failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar dashboard docente." },
      { status: 500 }
    );
  }
}

