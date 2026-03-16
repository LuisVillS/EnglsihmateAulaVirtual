import { redirect } from "next/navigation";
import { USER_ROLES } from "@/lib/roles";
import { getRequestSupabaseServerClient, getRequestUserContext } from "@/lib/request-user-context";

export async function requireStudentLibraryPageAccess({ allowAdmin = true } = {}) {
  const shellUser = await getRequestUserContext();

  if (!shellUser.user) {
    redirect("/login/access");
  }

  if (shellUser.isAdmin) {
    if (!allowAdmin) {
      redirect("/admin/library");
    }

    const supabase = await getRequestSupabaseServerClient();
    return {
      supabase,
      db: supabase,
      user: shellUser.user,
      shellUser,
      isGuest: false,
    };
  }

  if (shellUser.role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const supabase = await getRequestSupabaseServerClient();
  return {
    supabase,
    db: supabase,
    user: shellUser.user,
    shellUser,
    isGuest: false,
  };
}

export async function requireAdminLibraryPageAccess() {
  const context = await getRequestUserContext();
  if (!context.user || !context.isAdmin) {
    redirect("/admin/login");
  }

  return {
    supabase: context.supabase,
    user: context.user,
  };
}
