"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import MainHeader from "@/components/main-header";

const STORAGE_KEY = "englishmate.sidebar.collapsed";

export default function AppShell({
  children,
  pageTitle,
  user,
  role = "non_student",
  studyWithMeUnlocked = false,
  studyWithMeLockMessage = "Disponible solo para alumnos Premium.",
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (role !== "non_student") return;
    if (!pathname || !pathname.startsWith("/app") || pathname === "/app/matricula") return;
    router.replace("/app/matricula?locked=1");
  }, [pathname, role, router]);

  const headerUser = useMemo(
    () => ({
      name: user?.name || "Usuario",
      email: user?.email || "",
      avatarUrl: user?.avatarUrl || null,
    }),
    [user]
  );

  return (
    <div className="flex h-[100dvh] overflow-x-hidden bg-background text-foreground">
      <Sidebar
        role={role}
        studyWithMeUnlocked={studyWithMeUnlocked}
        studyWithMeLockMessage={studyWithMeLockMessage}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MainHeader
          title={pageTitle}
          user={headerUser}
          onOpenSidebar={() => setMobileOpen(true)}
        />
        <main className="safe-area-bottom relative flex-1 overflow-x-hidden overflow-y-auto">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 left-16 h-72 w-72 rounded-full bg-primary/10 blur-[160px]" />
            <div className="absolute top-10 right-20 h-72 w-72 rounded-full bg-primary-2/10 blur-[160px]" />
            <div className="absolute bottom-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/10 blur-[180px]" />
          </div>
          <div className="app-content relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
