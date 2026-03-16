import { redirect } from "next/navigation";
import { headers } from "next/headers";
import AppShell from "@/components/app-shell";
import { getShellUser } from "@/lib/user-shell";
import { USER_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppLayout({ children }) {
  const requestHeaders = await headers();
  const isFlipbookRoute = requestHeaders.get("x-library-flipbook-route") === "1";
  const { user, displayName, avatarUrl, isAdmin, role, studyWithMeUnlocked, studyWithMeLockMessage } =
    await getShellUser();

  if (!user) {
    redirect("/login/access");
  }

  if (isAdmin) {
    if (isFlipbookRoute) {
      return children;
    }
    redirect("/admin");
  }
  if (![USER_ROLES.STUDENT, USER_ROLES.NON_STUDENT].includes(role)) {
    redirect("/login");
  }

  return (
    <AppShell
      pageTitle={role === USER_ROLES.NON_STUDENT ? "Mi matrícula" : "Dashboard"}
      role={role}
      studyWithMeUnlocked={studyWithMeUnlocked}
      studyWithMeLockMessage={studyWithMeLockMessage}
      user={{ name: displayName, email: user.email, avatarUrl }}
    >
      {children}
    </AppShell>
  );
}
