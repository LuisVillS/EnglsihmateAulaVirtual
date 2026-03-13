import { NextResponse } from "next/server";
import { selectAdminById } from "@/lib/admins";
import { getAuthenticatedUser } from "@/lib/auth-monitor";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { resolveStudentIdentity } from "@/lib/duolingo/student-upsert";

export async function getDbClient() {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const db = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
  return { supabase, db };
}

export async function requireAdminRouteAccess({ label = "duolingo-admin-route" } = {}) {
  const { supabase, db } = await getDbClient();
  const {
    data: { user },
    error: userError,
  } = await getAuthenticatedUser(supabase, { label });

  if (userError || !user) {
    return {
      errorResponse: NextResponse.json({ error: "No autorizado." }, { status: 401 }),
    };
  }

  const adminRecord = await selectAdminById(supabase, user.id, "id");

  if (!adminRecord?.id) {
    return {
      errorResponse: NextResponse.json({ error: "Se requiere rol admin." }, { status: 403 }),
    };
  }

  return { supabase, db, user };
}

export async function resolveStudentFromRequest({ request, body = null, searchParams = null }) {
  const { supabase, db } = await getDbClient();

  const {
    data: { user },
  } = await getAuthenticatedUser(supabase, { label: "duolingo-resolve-student" });

  if (user?.id) {
    const profile = await resolveStudentIdentity({ userId: user.id, serviceClient: db });
    if (profile?.id) {
      return {
        profile,
        db,
        source: "session",
      };
    }
  }

  const params = searchParams || new URL(request.url).searchParams;
  const studentCode = body?.student_code || body?.studentCode || params.get("student_code") || params.get("studentCode");
  const idDocument = body?.id_document || body?.idDocument || params.get("id_document") || params.get("idDocument");
  const fullName = body?.full_name || body?.fullName || params.get("full_name") || params.get("fullName");
  const email = body?.email || params.get("email");

  if (!studentCode) {
    return {
      errorResponse: NextResponse.json(
        { error: "Falta student_code o sesión autenticada." },
        { status: 400 }
      ),
    };
  }

  try {
    const profile = await resolveStudentIdentity({
      studentCode,
      idDocument,
      fullName,
      email,
      serviceClient: db,
    });

    if (!profile?.id) {
      return {
        errorResponse: NextResponse.json({ error: "No se pudo resolver el alumno." }, { status: 404 }),
      };
    }

    return {
      profile,
      db,
      source: "student_code",
    };
  } catch (error) {
    return {
      errorResponse: NextResponse.json(
        { error: error?.message || "No se pudo autenticar alumno." },
        { status: 400 }
      ),
    };
  }
}
