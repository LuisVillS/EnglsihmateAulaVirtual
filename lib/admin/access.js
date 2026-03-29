import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { selectAdminById } from "@/lib/admins";
import { getAuthenticatedUser } from "@/lib/auth-monitor";
import { getCrmAccessState } from "@/lib/crm/auth";
import { getRequestUserContext } from "@/lib/request-user-context";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function requireAdminPageAccess() {
  const context = await getRequestUserContext();

  if (!context.user || !context.isAdmin) {
    redirect("/admin/login");
  }

  return {
    supabase: context.supabase,
    user: context.user,
    context,
  };
}

export async function requireCrmPageAccess() {
  const context = await getRequestUserContext();
  const hasCrmAccess = Boolean(context.user && (context.isAdmin || context.isCrmRole));

  if (!hasCrmAccess) {
    redirect("/admin/login");
  }

  return {
    supabase: context.supabase,
    user: context.user,
    context,
  };
}

export async function requireAdminRouteAccess({ label = "admin-route" } = {}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getAuthenticatedUser(supabase, { label });

  if (!user) {
    return {
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase,
      user: null,
    };
  }

  const adminRecord = await selectAdminById(supabase, user.id, "id");
  if (!adminRecord?.id) {
    return {
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
      user,
    };
  }

  return {
    supabase,
    user,
    adminRecord,
  };
}

export async function requireCrmRouteAccess({ label = "crm-route" } = {}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getAuthenticatedUser(supabase, { label });

  if (!user) {
    return {
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase,
      user: null,
    };
  }

  const accessState = await getCrmAccessState(supabase, user.id);
  if (!accessState?.isClassicAdmin && !accessState?.isCrmRole) {
    return {
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
      user,
    };
  }

  return {
    supabase,
    user,
    accessState,
  };
}
