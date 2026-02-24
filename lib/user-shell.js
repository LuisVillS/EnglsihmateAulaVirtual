import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

export async function getShellUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, displayName: "", avatarUrl: null, isAdmin: false, role: USER_ROLES.NON_STUDENT };
  }

  let isAdmin = false;
  let role = USER_ROLES.NON_STUDENT;
  let displayName = user?.user_metadata?.full_name || "";
  const avatarUrl = user?.user_metadata?.avatar_url || null;

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  isAdmin = Boolean(adminRecord?.id);
  if (isAdmin) {
    role = USER_ROLES.ADMIN;
  }
  if (adminRecord?.full_name) {
    displayName = adminRecord.full_name;
  } else if (!isAdmin) {
    let profileRow = null;
    if (hasServiceRoleClient() && user.email) {
      const service = getServiceSupabaseClient();
      const { data: byEmail } = await service
        .from("profiles")
        .select("full_name, role, status")
        .eq("email", user.email.toLowerCase())
        .maybeSingle();
      profileRow = byEmail || profileRow;
    }

    if (!profileRow) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, role, status")
        .eq("id", user.id)
        .maybeSingle();
      profileRow = data || profileRow;
    }

    if (profileRow?.full_name) {
      displayName = profileRow.full_name;
    }
    role = resolveProfileRole({ role: profileRow?.role, status: profileRow?.status });
  }

  return {
    user,
    displayName: displayName || user.email || "Usuario",
    avatarUrl,
    isAdmin,
    role,
  };
}
