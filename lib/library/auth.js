import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

export async function requireLibraryStudentRouteAccess({ allowAdmin = false } = {}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      errorResponse: NextResponse.json({ error: "No autorizado." }, { status: 401 }),
    };
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (adminRecord?.id) {
    if (!allowAdmin) {
      return {
        errorResponse: NextResponse.json({ error: "Solo estudiantes pueden acceder a la biblioteca." }, { status: 403 }),
      };
    }

    return {
      supabase,
      db: supabase,
      user,
      profile: null,
      role: USER_ROLES.ADMIN,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, status, course_level")
    .eq("id", user.id)
    .maybeSingle();

  const role = resolveProfileRole({ role: profile?.role, status: profile?.status });
  if (role !== USER_ROLES.STUDENT) {
    return {
      errorResponse: NextResponse.json({ error: "La biblioteca solo esta disponible para alumnos activos." }, { status: 403 }),
    };
  }

  return {
    supabase,
    db: supabase,
    user,
    profile,
    role,
  };
}
