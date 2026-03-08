import { redirect } from "next/navigation";
import { getShellUser } from "@/lib/user-shell";
import { USER_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function requireStudentLibraryPageAccess() {
  const shellUser = await getShellUser();

  if (!shellUser.user) {
    redirect("/");
  }

  if (shellUser.isAdmin) {
    redirect("/admin/library");
  }

  if (shellUser.role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const supabase = await createSupabaseServerClient();
  return {
    supabase,
    user: shellUser.user,
    shellUser,
  };
}

export async function requireAdminLibraryPageAccess() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    redirect("/admin/login");
  }

  return {
    supabase,
    user,
  };
}
