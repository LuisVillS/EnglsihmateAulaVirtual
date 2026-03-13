import { redirect } from "next/navigation";
import { headers } from "next/headers";
import AppShell from "@/components/app-shell";
import { getShellUser } from "@/lib/user-shell";
import { USER_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppLayout({ children }) {
  const requestHeaders = await headers();
  const isPublicFlipbookRoute = requestHeaders.get("x-public-flipbook") === "1";
  const { user, displayName, avatarUrl, isAdmin, role, studyWithMeUnlocked, studyWithMeLockMessage } =
    await getShellUser();

  if (isPublicFlipbookRoute) {
    return children;
  }

  if (!user) {
    redirect("/");
  }

  if (isAdmin) {
    redirect("/admin");
  }
  if (![USER_ROLES.STUDENT, USER_ROLES.NON_STUDENT].includes(role)) {
    redirect("/login");
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
