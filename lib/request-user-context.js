import { cache } from "react";
import { selectAdminById } from "@/lib/admins";
import { getAuthenticatedUser } from "@/lib/auth-monitor";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

export const getRequestSupabaseServerClient = cache(async function getRequestSupabaseServerClient() {
  return createSupabaseServerClient();
});

export const getRequestUserContext = cache(async function getRequestUserContext() {
  const supabase = await getRequestSupabaseServerClient();
  const {
    data: { user },
  } = await getAuthenticatedUser(supabase, { label: "request-user-context" });

  if (!user) {
    return {
      supabase,
      db: supabase,
      user: null,
      profile: null,
      displayName: "",
      avatarUrl: null,
      isAdmin: false,
      role: USER_ROLES.NON_STUDENT,
    };
  }

  let profile = null;
  let isAdmin = false;
  let role = USER_ROLES.NON_STUDENT;
  let displayName = user?.user_metadata?.full_name || "";
  const avatarUrl = user?.user_metadata?.avatar_url || null;

  const adminRecord = await selectAdminById(supabase, user.id, "id, full_name");

  isAdmin = Boolean(adminRecord?.id);
  if (isAdmin) {
    role = USER_ROLES.ADMIN;
    if (adminRecord?.full_name) {
      displayName = adminRecord.full_name;
    }
  } else {
    if (hasServiceRoleClient()) {
      const service = getServiceSupabaseClient();
      const { data: byId } = await service
        .from("profiles")
        .select("id, full_name, role, status, course_level")
        .eq("id", user.id)
        .maybeSingle();
      profile = byId || null;

      if (!profile && user.email) {
        const { data: byEmail } = await service
          .from("profiles")
          .select("id, full_name, role, status, course_level")
          .eq("email", user.email.toLowerCase())
          .maybeSingle();
        profile = byEmail || null;
      }
    }

    if (!profile) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, status, course_level")
        .eq("id", user.id)
        .maybeSingle();
      profile = data || null;
    }

    if (profile?.full_name) {
      displayName = profile.full_name;
    }
    role = resolveProfileRole({ role: profile?.role, status: profile?.status });
  }

  return {
    supabase,
    db: supabase,
    user,
    profile,
    displayName: displayName || user.email || "Usuario",
    avatarUrl,
    isAdmin,
    role,
  };
});
