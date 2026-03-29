"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/admin/crm", label: "Overview", icon: "overview" },
  { href: "/admin/crm/kanban", label: "Kanban", icon: "kanban" },
  { href: "/admin/crm/callinghub", label: "Calling Hub", icon: "phone" },
  { href: "/admin/crm/leads", label: "Leads", icon: "list" },
];

function Icon({ name }) {
  switch (name) {
    case "overview":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M4 19.5h16" />
          <path d="M6 16V8" />
          <path d="M12 16V4.5" />
          <path d="M18 16v-6" />
        </svg>
      );
    case "kanban":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="4" y="4" width="5" height="16" rx="1.6" />
          <rect x="10.5" y="4" width="4" height="9" rx="1.4" />
          <rect x="16" y="4" width="4" height="12" rx="1.4" />
        </svg>
      );
    case "phone":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M7 4.5h3l1 4-2 1.5c1 2 2.5 3.5 4.5 4.5L15 12l4 1v3c0 .8-.7 1.5-1.5 1.5A13.5 13.5 0 0 1 4.5 6 1.5 1.5 0 0 1 6 4.5Z" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M8 7h11" />
          <path d="M8 12h11" />
          <path d="M8 17h11" />
          <circle cx="4.5" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="17" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

function isActive(pathname, href) {
  if (href === "/admin/crm") {
    return pathname === "/admin/crm" || pathname === "/admin/crm/";
  }
  return pathname?.startsWith(href);
}

export default function CrmShell({ user, children }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[linear-gradient(180deg,#f6f8fc_0%,#eef3fb_100%)] text-[#0f172a]">
      <div
        className={`fixed inset-0 z-40 bg-[rgba(15,23,42,0.34)] backdrop-blur-[2px] transition-opacity md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-[300px] flex-col border-r border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,#0f1f46_0%,#153774_100%)] px-4 py-4 text-white shadow-[0_28px_70px_rgba(15,23,42,0.18)] transition-transform duration-300 md:static md:w-[280px] md:max-w-none md:translate-x-0 md:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">EnglishMate</p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em]">CRM</h1>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 text-white md:hidden"
            aria-label="Close CRM menu"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-5 rounded-[22px] border border-white/10 bg-white/6 p-4">
          <p className="text-sm font-semibold">{user?.name || "CRM user"}</p>
          <p className="mt-1 text-xs text-white/68">{user?.email || ""}</p>
          <div className="mt-3 inline-flex rounded-full border border-white/14 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
            {user?.roleLabel || "CRM"}
          </div>
        </div>

        <nav className="mt-6 flex-1 space-y-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-white text-[#103474] shadow-[0_14px_26px_rgba(15,23,42,0.16)]"
                    : "text-white/82 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    active ? "bg-[#eef3ff] text-[#103474]" : "bg-white/10 text-white"
                  }`}
                >
                  <Icon name={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-white/12 pt-4">
          {user?.isClassicAdmin ? (
            <Link
              href="/admin"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-2xl border border-white/16 bg-white/6 px-3 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Classic admin
            </Link>
          ) : null}
          <Link
            href="/api/auth/logout"
            className="inline-flex min-h-10 w-full items-center justify-center rounded-2xl border border-white/16 bg-transparent px-3 text-sm font-semibold text-white/88 transition hover:bg-white/8"
          >
            Sign out
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-[rgba(15,23,42,0.08)] bg-[rgba(246,248,252,0.92)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white text-[#103474] md:hidden"
                aria-label="Open CRM menu"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#94a3b8]">CRM workspace</p>
                <p className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">
                  Classroom leads under one operator surface
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
