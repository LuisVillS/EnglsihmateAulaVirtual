import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { getShellUser } from "@/lib/user-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfileLayout({ children }) {
  const { user, displayName, avatarUrl, role, studyWithMeUnlocked, studyWithMeLockMessage } = await getShellUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AppShell
      pageTitle="Mi perfil"
      role={role}
      studyWithMeUnlocked={studyWithMeUnlocked}
      studyWithMeLockMessage={studyWithMeLockMessage}
      user={{ name: displayName, email: user.email, avatarUrl }}
    >
      {children}
    </AppShell>
  );
}
