import { redirect } from "next/navigation";
import { USER_ROLES } from "@/lib/roles";
import { getRequestSupabaseServerClient, getRequestUserContext } from "@/lib/request-user-context";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

export async function requireStudentLibraryPageAccess({ allowGuest = false, allowAdmin = false } = {}) {
  const shellUser = await getRequestUserContext();
  const guestDb = allowGuest && hasServiceRoleClient() ? getServiceSupabaseClient() : null;

  if (!shellUser.user) {
    if (guestDb) {
      return {
        supabase: guestDb,
        db: guestDb,
        user: null,
        shellUser,
        isGuest: true,
      };
    }
    redirect("/");
  }

  if (shellUser.isAdmin) {
    if (!allowAdmin) {
      if (guestDb) {
        return {
          supabase: guestDb,
          db: guestDb,
          user: shellUser.user,
          shellUser,
          isGuest: true,
        };
      }
      redirect("/admin/library");
    }
  }

  if (shellUser.role !== USER_ROLES.STUDENT) {
    if (guestDb) {
      return {
        supabase: guestDb,
        db: guestDb,
        user: shellUser.user,
        shellUser,
        isGuest: true,
      };
    }
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
