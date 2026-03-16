import { NextResponse } from "next/server";
import { USER_ROLES } from "@/lib/roles";
import { getRequestUserContext } from "@/lib/request-user-context";

export async function requireLibraryStudentRouteAccess({ allowAdmin = true } = {}) {
  const context = await getRequestUserContext();

  if (!context.user) {
    return {
      errorResponse: NextResponse.json({ error: "No autorizado." }, { status: 401 }),
    };
  }

  if (context.isAdmin) {
    if (!allowAdmin) {
      return {
        errorResponse: NextResponse.json({ error: "Solo estudiantes pueden acceder a la biblioteca." }, { status: 403 }),
      };
    }

    return {
      supabase: context.supabase,
      db: context.db,
      user: context.user,
      profile: null,
      role: USER_ROLES.ADMIN,
    };
  }

  if (context.role !== USER_ROLES.STUDENT) {
    return {
      errorResponse: NextResponse.json({ error: "La biblioteca solo esta disponible para alumnos activos." }, { status: 403 }),
    };
  }

  return {
    supabase: context.supabase,
    db: context.db,
    user: context.user,
    profile: context.profile,
    role: context.role,
  };
}
