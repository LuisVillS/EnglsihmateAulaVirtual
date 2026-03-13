import { NextResponse } from "next/server";
import { USER_ROLES } from "@/lib/roles";
import { getRequestUserContext } from "@/lib/request-user-context";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

export async function requireLibraryStudentRouteAccess({ allowAdmin = false, allowGuest = false } = {}) {
  const context = await getRequestUserContext();
  const guestDb = allowGuest && hasServiceRoleClient() ? getServiceSupabaseClient() : null;

  if (!context.user) {
    if (guestDb) {
      return {
        supabase: guestDb,
        db: guestDb,
        user: null,
        profile: null,
        role: "guest",
        isGuest: true,
      };
    }
    return {
      errorResponse: NextResponse.json({ error: "No autorizado." }, { status: 401 }),
    };
  }

  if (context.isAdmin) {
    if (!allowAdmin) {
      if (guestDb) {
        return {
          supabase: guestDb,
          db: guestDb,
          user: context.user,
          profile: null,
          role: USER_ROLES.ADMIN,
          isGuest: false,
        };
      }
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
    if (guestDb) {
      return {
        supabase: guestDb,
        db: guestDb,
        user: context.user,
        profile: context.profile,
        role: context.role,
        isGuest: true,
      };
    }
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
