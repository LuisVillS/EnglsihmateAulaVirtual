"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import MainHeader from "@/components/main-header";

const STORAGE_KEY = "englishmate.sidebar.desktop-open";

export default function AppShell({
  children,
  pageTitle,
  user,
  role = "non_student",
  studentUiLanguage = "es",
  studyWithMeUnlocked = false,
  studyWithMeLockMessage = "Disponible para alumnos con curso activo.",
}) {
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isFlipbookRoute = pathname?.startsWith("/app/library/flipbook/");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const frameId = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setDesktopSidebarOpen(stored !== "0");
      setSidebarReady(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!sidebarReady || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, desktopSidebarOpen ? "1" : "0");
  }, [desktopSidebarOpen, sidebarReady]);

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

  const toggleSidebar = () => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) {
      setDesktopSidebarOpen((prev) => !prev);
      return;
    }
    setMobileOpen((prev) => !prev);
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#f3f5f8] text-foreground">
      <Sidebar
        role={role}
        studentUiLanguage={studentUiLanguage}
        studyWithMeUnlocked={studyWithMeUnlocked}
        studyWithMeLockMessage={studyWithMeLockMessage}
        desktopOpen={desktopSidebarOpen}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col border-l border-[rgba(15,23,42,0.04)]">
        <MainHeader
          title={pageTitle}
          studentUiLanguage={studentUiLanguage}
          user={headerUser}
          onToggleSidebar={toggleSidebar}
          compact={isFlipbookRoute}
        />
        <main
          className={`relative flex-1 overflow-x-hidden ${
            isFlipbookRoute ? "overflow-y-hidden bg-black" : "safe-area-bottom overflow-y-auto bg-[#f3f5f8]"
          }`}
        >
          <div
            className={`app-content relative w-full ${
              isFlipbookRoute
                ? "flex h-full flex-col bg-black px-0 py-0"
                : "mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-7"
            }`}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
