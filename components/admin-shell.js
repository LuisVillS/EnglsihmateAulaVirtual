"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import UserAvatarMenu from "@/components/user-avatar-menu";
import { ADMIN_NAV_SECTIONS, getAdminRouteMeta } from "@/lib/admin-navigation";

function Icon({ name }) {
  switch (name) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="11" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="17.5" width="7" height="3" rx="1.2" />
        </svg>
      );
    case "students":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <circle cx="9" cy="8" r="3" />
          <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
          <circle cx="17" cy="9" r="2.2" />
          <path d="M14.5 17.5a3.8 3.8 0 0 1 5 0" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.8" />
          <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" />
        </svg>
      );
    case "wallet":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M5 7.5h13a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 18 18.5H6A2.5 2.5 0 0 1 3.5 16V8.8A2.3 2.3 0 0 1 5.8 6.5H17" />
          <path d="M16 13h4.5" />
          <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "analytics":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M4 19.5h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-4" />
        </svg>
      );
    case "template":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="4" y="4" width="16" height="16" rx="2.2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case "exercise":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M8 5h11" />
          <path d="M8 12h11" />
          <path d="M8 19h11" />
          <path d="m4.5 5.5 1 1 2-2" />
          <path d="m4.5 12.5 1 1 2-2" />
          <path d="m4.5 19.5 1 1 2-2" />
        </svg>
      );
    case "flashcards":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="6" y="4" width="12" height="14" rx="2" />
          <path d="M8 8h8M8 12h5" />
          <path d="M4 8.5v9A2.5 2.5 0 0 0 6.5 20H15" />
        </svg>
      );
    case "library":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M5 5.5a2 2 0 0 1 2-2h10.5v17H7a2 2 0 0 1-2-2Z" />
          <path d="M8 3.5v17" />
        </svg>
      );
    case "discord":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M19.1 4.9A16 16 0 0 0 15 3.5a11.7 11.7 0 0 0-.6 1.2 15 15 0 0 0-4.8 0c-.2-.4-.4-.8-.6-1.2a16 16 0 0 0-4.1 1.4C2.6 8.1 2 11.2 2.2 14.2a15.8 15.8 0 0 0 4.8 2.4c.4-.6.7-1.2 1-1.8a10.3 10.3 0 0 1-1.6-.8l.4-.3a11.2 11.2 0 0 0 10.4 0l.4.3a10.5 10.5 0 0 1-1.6.8c.3.6.6 1.2 1 1.8a15.7 15.7 0 0 0 4.8-2.4c.3-3-0.3-6.1-2.7-9.3ZM8.9 13.5c-.7 0-1.3-.7-1.3-1.6 0-.9.6-1.6 1.3-1.6.7 0 1.3.7 1.3 1.6 0 .9-.6 1.6-1.3 1.6Zm6.2 0c-.7 0-1.3-.7-1.3-1.6 0-.9.6-1.6 1.3-1.6.7 0 1.3.7 1.3 1.6 0 .9-.6 1.6-1.3 1.6Z" />
        </svg>
      );
    default:
      return null;
  }
}

function AdminNavItem({ item, active, onNavigate }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex min-h-10 items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-[#103474] text-white shadow-[0_10px_24px_rgba(16,52,116,0.18)]"
          : "text-[#334155] hover:bg-[#f7f9ff] hover:text-[#0f172a]"
      }`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-xl ${
          active ? "bg-white/12 text-white" : "bg-[#f3f7fd] text-[#103474]"
        }`}
      >
        <Icon name={item.icon} />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function AdminShell({ user, children }) {
  const pathname = usePathname();
  const routeMeta = getAdminRouteMeta(pathname, "Administracion");
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href) => {
    if (href === "/admin") {
      return pathname === "/admin" || pathname === "/admin/";
    }
    if (href === "/admin/commissions") {
      if (pathname?.startsWith("/admin/courses/templates")) return false;
      if (pathname?.startsWith("/admin/teacher-dashboard")) return false;
      return pathname?.startsWith("/admin/commissions") || pathname?.startsWith("/admin/courses");
    }
    return pathname?.startsWith(href);
  };

  const handleNavigate = () => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    setMobileOpen(false);
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#f3f6fb] text-[#0f172a]">
      <div
        className={`fixed inset-0 z-40 bg-[rgba(15,23,42,0.36)] backdrop-blur-[2px] transition-opacity md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`safe-area-top safe-area-bottom fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-[280px] flex-col border-r border-[rgba(15,23,42,0.08)] bg-white px-3 py-4 shadow-[0_28px_70px_rgba(15,23,42,0.16)] transition-transform duration-300 md:static md:w-[248px] md:min-w-[248px] md:max-w-none md:translate-x-0 md:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#103474] text-xs font-black uppercase tracking-[0.16em] text-white">
              EM
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Administracion</p>
              <p className="text-sm font-semibold text-[#111827]">EnglishMate</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.08)] text-[#475569] md:hidden"
            aria-label="Close menu"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          {ADMIN_NAV_SECTIONS.map((section) => (
            <section key={section.id} className="mb-5">
              <div className="mb-2 flex items-center gap-2 px-2">
                <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                  {section.label}
                </p>
                <div className="h-px flex-1 bg-[rgba(15,23,42,0.08)]" />
              </div>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <AdminNavItem key={item.href} item={item} active={isActive(item.href)} onNavigate={handleNavigate} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-[rgba(15,23,42,0.08)] pt-3">
          <Link
            href="/api/auth/logout"
            className="inline-flex min-h-10 w-full items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-sm font-semibold text-[#334155] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff] hover:text-[#111827]"
          >
            Cerrar sesion
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-area-top sticky top-0 z-30 border-b border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.92)] backdrop-blur-xl">
          <div className="safe-area-x flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.08)] bg-white text-[#103474] md:hidden"
                aria-label="Open menu"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">{routeMeta.section}</p>
                <h1 className="truncate text-base font-semibold text-[#111827]">{routeMeta.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right md:block">
                <p className="text-xs font-semibold text-[#111827]">{user?.name || "Administrador"}</p>
                <p className="text-[11px] text-[#94a3b8]">{user?.email || ""}</p>
              </div>
              <UserAvatarMenu name={user?.name} email={user?.email} avatarUrl={user?.avatarUrl} />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="min-h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
