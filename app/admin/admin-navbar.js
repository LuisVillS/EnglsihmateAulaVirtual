"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const NAV_LINKS = [
  { href: "/admin", label: "Inicio" },
  { href: "/admin/commissions", label: "Comisiones" },
  { href: "/admin/teacher-dashboard", label: "Teacher Dashboard" },
  { href: "/admin/students", label: "Alumnos" },
  { href: "/admin/prematriculas", label: "Pre-matriculas" },
  { href: "/admin/courses/templates", label: "Plantillas" },
];

function isLinkActive(pathname, href) {
  const current = pathname || "";
  if (href === "/admin") {
    return current === "/admin" || current === "/admin/";
  }
  if (href === "/admin/courses/templates") {
    return current.startsWith("/admin/courses/templates");
  }
  if (href === "/admin/teacher-dashboard") {
    return current.startsWith("/admin/teacher-dashboard");
  }
  if (href === "/admin/commissions") {
    if (current.startsWith("/admin/courses/templates")) return false;
    if (current.startsWith("/admin/teacher-dashboard")) return false;
    return current.startsWith("/admin/commissions") || current.startsWith("/admin/courses");
  }
  return current.startsWith(href);
}

export default function AdminNavbar() {
  const pathname = usePathname();

  return (
    <nav className="safe-area-top sticky top-0 z-40 border-b border-white/10 bg-[#1F202E]/95 backdrop-blur">
      <div className="safe-area-x mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-white sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-2">
          {NAV_LINKS.map((link) => {
            const active = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/75 transition hover:border-white/35 hover:text-white"
          onClick={async () => {
            try {
              const supabase = getSupabaseBrowserClient();
              await supabase.auth.signOut();
            } catch (error) {
              console.error("No se pudo cerrar sesion en el cliente", error);
            }
            try {
              await fetch("/api/auth/logout", { method: "POST" });
            } catch (error) {
              console.error("No se pudo cerrar sesion en el servidor", error);
            }
            window.location.href = "/";
          }}
        >
          Cerrar sesion
        </button>
      </div>
    </nav>
  );
}
