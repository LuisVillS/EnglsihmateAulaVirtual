import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { getShellUser } from "@/lib/user-shell";
import { USER_ROLES } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getStudyWithMeAccess } from "@/lib/study-with-me-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppLayout({ children }) {
  const { user, displayName, avatarUrl, isAdmin, role } = await getShellUser();

  if (!user) {
    redirect("/");
  }

  if (isAdmin) {
    redirect("/admin");
  }
  if (![USER_ROLES.STUDENT, USER_ROLES.NON_STUDENT].includes(role)) {
    redirect("/login");
  }

  let studyWithMeUnlocked = false;
  let studyWithMeLockMessage = "Disponible solo para alumnos Premium.";
  if (role === USER_ROLES.STUDENT && user?.id) {
    const supabase = await createSupabaseServerClient();
    const access = await getStudyWithMeAccess({ supabase, userId: user.id });
    studyWithMeUnlocked = access.canAccessPage;
    if (!access.canAccessPage) {
      if (access.reason === "not-premium") {
        studyWithMeLockMessage = "Exclusivo del plan Premium.";
      } else {
        studyWithMeLockMessage = "Disponible para Premium con curso activo y renovacion vigente.";
      }
    }
  }

  return (
    <AppShell
      pageTitle={role === USER_ROLES.NON_STUDENT ? "Mi matricula" : "Inicio"}
      role={role}
      studyWithMeUnlocked={studyWithMeUnlocked}
      studyWithMeLockMessage={studyWithMeLockMessage}
      user={{ name: displayName, email: user.email, avatarUrl }}
    >
      {children}
    </AppShell>
  );
}
