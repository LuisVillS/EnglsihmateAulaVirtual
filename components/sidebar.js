"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_WA_URL;

const NAV_ITEMS = [
  { label: "Inicio", href: "/app", icon: "home" },
  { label: "Mi matricula", href: "/app/matricula", icon: "calendar" },
  { label: "Mi curso", href: "/app/curso", icon: "book" },
  { label: "Calendario academico", href: "/app/calendario", icon: "calendar" },
  { label: "Ruta academica", href: "/app/ruta-academica", icon: "path" },
  { label: "Study With Me", href: "/app/study-with-me", icon: "study" },
];

const SECONDARY_ITEMS = [
  { label: "Discord", href: "/app/discord", icon: "discord" },
  { label: "Eventos", href: "/app/eventos", icon: "spark" },
  { label: "Portal trabajo", href: "/app/empleo", icon: "briefcase" },
];

function Icon({ name }) {
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 10v9h5v-5h4v5h5v-9" />
        </svg>
      );
    case "book":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 5.5C4 4.1 5.1 3 6.5 3H19v16H6.5C5.1 19 4 17.9 4 16.5Z" />
          <path d="M8 3v13" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
          <path d="M7.5 3v4M16.5 3v4M3.5 9h17" />
        </svg>
      );
    case "path":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 5h6a3 3 0 0 1 0 6H8a3 3 0 1 0 0 6h11" />
          <circle cx="5" cy="5" r="2" />
          <circle cx="19" cy="17" r="2" />
        </svg>
      );
    case "discord":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M19.1 4.9A16 16 0 0 0 15 3.5a11.7 11.7 0 0 0-.6 1.2 15 15 0 0 0-4.8 0c-.2-.4-.4-.8-.6-1.2a16 16 0 0 0-4.1 1.4C2.6 8.1 2 11.2 2.2 14.2a15.8 15.8 0 0 0 4.8 2.4c.4-.6.7-1.2 1-1.8a10.3 10.3 0 0 1-1.6-.8l.4-.3a11.2 11.2 0 0 0 10.4 0l.4.3a10.5 10.5 0 0 1-1.6.8c.3.6.6 1.2 1 1.8a15.7 15.7 0 0 0 4.8-2.4c.3-3-0.3-6.1-2.7-9.3ZM8.9 13.5c-.7 0-1.3-.7-1.3-1.6 0-.9.6-1.6 1.3-1.6.7 0 1.3.7 1.3 1.6 0 .9-.6 1.6-1.3 1.6Zm6.2 0c-.7 0-1.3-.7-1.3-1.6 0-.9.6-1.6 1.3-1.6.7 0 1.3.7 1.3 1.6 0 .9-.6 1.6-1.3 1.6Z" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3l1.7 4.2L18 9l-4.3 1.8L12 15l-1.7-4.2L6 9l4.3-1.8Z" />
          <path d="M5 17l.9 2.2L8 20l-2.1.8L5 23l-.9-2.2L2 20l2.1-.8Z" />
        </svg>
      );
    case "briefcase":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="6.5" width="17" height="13" rx="2.5" />
          <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5" />
          <path d="M3.5 12h17" />
        </svg>
      );
    case "study":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M9 18v3h6v-3" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      );
    case "practice":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2v8" />
          <path d="M8.5 7.5 12 11l3.5-3.5" />
          <path d="M5 12h14" />
          <path d="M7 16h10" />
          <path d="M9 20h6" />
        </svg>
      );
    case "chevron":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M12 3a9 9 0 0 0-7.6 13.8L3 21l4.4-1.4A9 9 0 1 0 12 3Zm5 12.9c-.2.5-1.2 1-1.7 1.1-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.6-.6-2.7-1.1-4.4-3.7-4.6-4-.1-.2-1-1.3-1-2.5s.6-1.7.8-1.9c.2-.2.5-.3.8-.3h.6c.2 0 .5 0 .7.5.2.5.7 1.7.8 1.8.1.1.1.3 0 .5-.1.2-.2.3-.3.5-.2.2-.4.4-.2.7.1.3.7 1.2 1.6 2 .1.1.2.2.3.2.3.1.5 0 .7-.1.3-.2.6-.7.8-1 .2-.2.4-.3.6-.2.2.1 1.4.7 1.7.8.3.1.5.2.6.3.1.1.1.6-.1 1.1Z" />
        </svg>
      );
    case "logout":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M9 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
          <path d="M3 12h10" />
          <path d="M9 8l4 4-4 4" />
        </svg>
      );
    default:
      return null;
  }
}

function Tooltip({ label }) {
  return (
      <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-[#1F202E] px-3 py-1.5 text-xs text-white shadow-xl group-hover:flex">
      {label}
    </span>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function NavItem({ item, active, collapsed, disabled = false, lockMessage = "", onLockedPress }) {
  const baseClasses =
    "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition";
  const activeClasses = disabled
    ? "cursor-not-allowed text-white/35"
    : active
      ? "bg-white/16 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
      : "text-white/70 hover:bg-white/10 hover:text-white";

  const content = (
    <>
      <span className="text-white/90">{<Icon name={item.icon} />}</span>
      <span className={collapsed ? "md:sr-only" : ""}>{item.label}</span>
      {disabled && !collapsed ? (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-white/50">
          <LockIcon />
        </span>
      ) : null}
      {disabled && !collapsed && lockMessage ? (
        <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-[#1F202E] px-3 py-1.5 text-xs text-white shadow-xl group-hover:flex">
          {lockMessage}
        </span>
      ) : null}
      {collapsed ? <Tooltip label={disabled ? lockMessage || `${item.label} (bloqueado)` : item.label} /> : null}
    </>
  );

  if (disabled) {
    return (
      <button
        type="button"
        className={`${baseClasses} ${activeClasses} w-full text-left`}
        onClick={() => onLockedPress?.(lockMessage || `${item.label} bloqueado`)}
        title={lockMessage || `${item.label} bloqueado`}
      >
        {content}
      </button>
    );
  }

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} ${activeClasses}`}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={item.href} className={`${baseClasses} ${activeClasses}`}>
      {content}
    </Link>
  );
}

function SupportButton({ collapsed }) {
  const content = (
    <>
      <span className="text-[#25d366]">
        <Icon name="whatsapp" />
      </span>
      <span className={collapsed ? "md:sr-only" : ""}>Soporte estudiantil</span>
      {collapsed ? <Tooltip label="Soporte estudiantil" /> : null}
    </>
  );

  return (
    <a
      href={SUPPORT_URL || "https://wa.me/"}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex items-center gap-3 rounded-2xl border border-white/15 bg-white/8 px-3 py-3 text-sm font-semibold text-white transition hover:border-accent/70 hover:bg-accent/20"
    >
      {content}
    </a>
  );
}

function LogoutButton({ collapsed }) {
  return (
    <button
      type="button"
      className="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
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
      <span className="text-white/90">
        <Icon name="logout" />
      </span>
      <span className={collapsed ? "md:sr-only" : ""}>Cerrar sesion</span>
      {collapsed ? <Tooltip label="Cerrar sesion" /> : null}
    </button>
  );
}

export default function Sidebar({
  role = "non_student",
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  studyWithMeUnlocked = false,
  studyWithMeLockMessage = "Disponible solo para alumnos Premium.",
}) {
  const pathname = usePathname();
  const isLockedRole = role === "non_student";
  const [mobileLockedMessage, setMobileLockedMessage] = useState("");

  const navItems = useMemo(() => NAV_ITEMS, []);
  const secondaryItems = useMemo(() => SECONDARY_ITEMS, []);

  const isActive = (href) => {
    if (!href) return false;
    if (href === "/app") return pathname === "/app";
    return pathname?.startsWith(href);
  };

  const widthClass = collapsed
    ? "md:w-[80px] md:min-w-[80px] md:basis-[80px]"
    : "md:w-[260px] md:min-w-[260px] md:basis-[260px]";
  const handleLockedPress = (message) => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    setMobileLockedMessage(String(message || "Acceso bloqueado."));
  };

  useEffect(() => {
    if (!mobileLockedMessage) return;
    const timeoutId = window.setTimeout(() => setMobileLockedMessage(""), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [mobileLockedMessage]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onCloseMobile}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-full flex-col border-r border-white/10 bg-[#1F202E] px-3 py-5 text-white backdrop-blur transition-transform duration-300 md:static md:flex-none md:translate-x-0 ${widthClass} ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-lg font-semibold text-white">
              Em
            </div>
            <div className={collapsed ? "md:sr-only" : ""}>
              <p className="text-sm font-semibold text-white">EnglishMate</p>
              <p className="text-xs text-white/65">Aula virtual</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition hover:bg-white/20 md:hidden"
            aria-label="Cerrar menu"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/75 transition hover:bg-white/20 md:flex"
            aria-label="Colapsar sidebar"
          >
            <span className={collapsed ? "rotate-180 transition" : "transition"}>
              <Icon name="chevron" />
            </span>
          </button>
        </div>

        <div className="mt-6 space-y-1 px-1">
          {mobileLockedMessage ? (
            <p className="rounded-xl border border-accent/45 bg-accent/20 px-3 py-2 text-xs font-medium text-white md:hidden">
              {mobileLockedMessage}
            </p>
          ) : null}
          {navItems.map((item) => (
            <NavItem
              key={item.label}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
              lockMessage={item.href === "/app/study-with-me" ? studyWithMeLockMessage : ""}
              onLockedPress={handleLockedPress}
              disabled={
                isLockedRole
                  ? item.href !== "/app/matricula"
                  : item.href === "/app/study-with-me" && !studyWithMeUnlocked
              }
            />
          ))}
        </div>

        <div className="my-5 h-px w-full bg-white/12" />

        <div className="space-y-1 px-1">
          {secondaryItems.map((item) => (
            <NavItem
              key={item.label}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
              disabled={isLockedRole}
            />
          ))}
        </div>

        <div className="mt-6 px-1">
          <SupportButton collapsed={collapsed} />
        </div>

        <div className="mt-auto px-1 pt-6">
          <LogoutButton collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}
