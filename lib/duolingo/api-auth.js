import { getAuthenticatedUser } from "../auth-monitor.js";
import { resolveStudentIdentity } from "./student-upsert.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function getDbClient() {
  const [{ createSupabaseServerClient }, { getServiceSupabaseClient, hasServiceRoleClient }] = await Promise.all([
    import("../supabase-server.js"),
    import("../supabase-service.js"),
  ]);

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const db = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
  return { supabase, db };
}

export async function requireAdminRouteAccess({ label = "duolingo-admin-route" } = {}) {
  const [{ selectAdminById }, { supabase, db }] = await Promise.all([
    import("../admins.js"),
    getDbClient(),
  ]);

  const {
    data: { user },
    error: userError,
  } = await getAuthenticatedUser(supabase, { label });

  if (userError || !user) {
    return {
      errorResponse: jsonResponse({ error: "No autorizado." }, 401),
    };
  }

  const adminRecord = await selectAdminById(supabase, user.id, "id");

  if (!adminRecord?.id) {
    return {
      errorResponse: jsonResponse({ error: "Se requiere rol admin." }, 403),
    };
  }

  return { supabase, db, user };
}

export async function resolveStudentFromRequest({
  getDbClientFn = getDbClient,
  getAuthenticatedUserFn = getAuthenticatedUser,
  resolveStudentIdentityFn = resolveStudentIdentity,
} = {}) {
  const { supabase, db } = await getDbClientFn();

  const {
    data: { user },
    error: userError,
  } = await getAuthenticatedUserFn(supabase, { label: "duolingo-resolve-student" });

  if (userError || !user?.id) {
    return {
      errorResponse: jsonResponse({ error: "No autorizado." }, 401),
    };
  }

  const profile = await resolveStudentIdentityFn({
    userId: user.id,
    userEmail: user.email || null,
    serviceClient: db,
  });

  if (!profile?.id) {
    return {
      errorResponse: jsonResponse({ error: "No se pudo resolver el alumno." }, 404),
    };
  }

  return {
    profile,
    db,
    source: "session",
  };
}

export async function assertOwnedPracticeItem(db, { practiceItemId, userId }) {
  if (!practiceItemId) {
    return { practiceItem: null };
  }

  const { data: practiceItem, error: practiceItemError } = await db
    .from("practice_session_items")
    .select("id, practice_session_id, answered_at, xp_earned")
    .eq("id", practiceItemId)
    .maybeSingle();

  if (practiceItemError) {
    throw new Error(practiceItemError.message || "No se pudo cargar el item de practica.");
  }

  if (!practiceItem?.id) {
    return { practiceItem: null };
  }

  const { data: sessionOwner, error: sessionOwnerError } = await db
    .from("practice_sessions")
    .select("id")
    .eq("id", practiceItem.practice_session_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionOwnerError) {
    throw new Error(sessionOwnerError.message || "No se pudo validar el item de practica.");
  }

  if (!sessionOwner?.id) {
    return {
      errorResponse: jsonResponse({ error: "No autorizado." }, 403),
    };
  }

  return { practiceItem };
}
