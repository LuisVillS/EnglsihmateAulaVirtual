"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  STUDENT_DASHBOARD_ITEM,
  STUDENT_NAV_SECTIONS,
} from "@/lib/student-navigation";

const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_WA_URL;
const SIDEBAR_LOGO_SRC = "/brand/sidebar-logo-full.svg";
const SIDEBAR_COLLAPSED_LOGO_SRC = "/brand/sidebar-logo-collapsed.svg";

function Icon({ name }) {
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 10v9h5v-5h4v5h5v-9" />
        </svg>
      );
    case "book":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v16H7A2.5 2.5 0 0 0 4.5 21Z" />
          <path d="M7 3v16" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.8" />
          <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" />
        </svg>
      );
    case "practice":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M12 4v7" />
          <path d="m8.5 8 3.5 3.5L15.5 8" />
          <path d="M5 14.5h14" />
          <path d="M7.5 18h9" />
        </svg>
      );
    case "competition":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M7 5h10v3a5 5 0 0 1-10 0V5Z" />
          <path d="M9 17h6M10 20h4" />
          <path d="M8 8H5a2 2 0 0 0 2 3h1" />
          <path d="M16 8h3a2 2 0 0 1-2 3h-1" />
          <path d="M12 13v4" />
        </svg>
      );
    case "flashcards":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="4" y="6" width="13" height="10" rx="2.4" />
          <path d="M7 10h7M7 13h5" />
          <path d="M9 4h9a2 2 0 0 1 2 2v10" />
        </svg>
      );
    case "study":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="3.5" y="5.5" width="17" height="11" rx="2.8" />
          <path d="M9 19.5h6M12 16.5v3" />
          <circle cx="12" cy="11" r="2.4" />
        </svg>
      );
    case "library":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M5 5.5a2 2 0 0 1 2-2h10.5v17H7a2 2 0 0 1-2-2Z" />
          <path d="M8 3.5v17" />
        </svg>
      );
    case "discord":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
          <path d="M19.1 4.9A16 16 0 0 0 15 3.5a11.7 11.7 0 0 0-.6 1.2 15 15 0 0 0-4.8 0c-.2-.4-.4-.8-.6-1.2a16 16 0 0 0-4.1 1.4C2.6 8.1 2 11.2 2.2 14.2a15.8 15.8 0 0 0 4.8 2.4c.4-.6.7-1.2 1-1.8a10.3 10.3 0 0 1-1.6-.8l.4-.3a11.2 11.2 0 0 0 10.4 0l.4.3a10.5 10.5 0 0 1-1.6.8c.3.6.6 1.2 1 1.8a15.7 15.7 0 0 0 4.8-2.4c.3-3-0.3-6.1-2.7-9.3ZM8.9 13.5c-.7 0-1.3-.7-1.3-1.6 0-.9.6-1.6 1.3-1.6.7 0 1.3.7 1.3 1.6 0 .9-.6 1.6-1.3 1.6Zm6.2 0c-.7 0-1.3-.7-1.3-1.6 0-.9.6-1.6 1.3-1.6.7 0 1.3.7 1.3 1.6 0 .9-.6 1.6-1.3 1.6Z" />
        </svg>
      );
    case "clipboard":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="6" y="4.5" width="12" height="16" rx="2.2" />
          <path d="M9 4.5h6v3H9z" />
          <path d="M9 11h6M9 15h6" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
          <path d="M12 3a9 9 0 0 0-7.6 13.8L3 21l4.4-1.4A9 9 0 1 0 12 3Zm5 12.9c-.2.5-1.2 1-1.7 1.1-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.6-.6-2.7-1.1-4.4-3.7-4.6-4-.1-.2-1-1.3-1-2.5s.6-1.7.8-1.9c.2-.2.5-.3.8-.3h.6c.2 0 .5 0 .7.5.2.5.7 1.7.8 1.8.1.1.1.3 0 .5-.1.2-.2.3-.3.5-.2.2-.4.4-.2.7.1.3.7 1.2 1.6 2 .1.1.2.2.3.2.3.1.5 0 .7-.1.3-.2.6-.7.8-1 .2-.2.4-.3.6-.2.2.1 1.4.7 1.7.8.3.1.5.2.6.3.1.1.1.6-.1 1.1Z" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    default:
      return null;
  }
}

function SidebarLogo() {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="flex h-10 items-center">
      {!imageFailed ? (
        <Image
          src={SIDEBAR_LOGO_SRC}
          alt="EnglishMate"
          width={120}
          height={24}
          className="h-6 w-auto object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[rgba(16,52,116,0.14)] bg-[#f8fbff] text-[11px] font-black uppercase tracking-[0.2em] text-[#103474]">
          EM
        </div>
      )}
    </div>
  );
}

function SidebarCollapsedLogo() {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="flex h-10 w-10 items-center justify-center">
      {!imageFailed ? (
        <Image
          src={SIDEBAR_COLLAPSED_LOGO_SRC}
          alt="EnglishMate"
          width={40}
          height={40}
          className="h-10 w-10 object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[rgba(16,52,116,0.14)] bg-[#f8fbff] text-[11px] font-black uppercase tracking-[0.2em] text-[#103474]">
          EM
        </div>
      )}
    </div>
  );
}

function NavItem({
  item,
  active,
  disabled = false,
  lockMessage = "",
  onLockedPress,
  onNavigate,
  collapsed = false,
  onTooltipChange,
}) {
  const classes = disabled
    ? "cursor-not-allowed text-[#94a3b8]"
    : active
      ? "border border-[rgba(16,52,116,0.1)] bg-[#eef4ff] text-[#103474]"
      : "text-[#0f172a] hover:bg-[#f6f9ff]";
  const iconClasses = active ? "text-[#103474]" : "text-[#103474]";

  const content = (
    <>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${iconClasses}`}>
        <Icon name={disabled ? "lock" : item.icon} />
      </span>
      <span className={`truncate text-[15px] leading-5 font-medium ${collapsed ? "md:hidden" : ""} ${active ? "text-[#103474]" : disabled ? "text-[#94a3b8]" : "text-[#0f172a]"}`}>
          {item.label}
      </span>
    </>
  );

  const baseClassName = `group relative flex min-h-11 items-center rounded-[12px] transition ${classes} ${
    collapsed ? "gap-3 px-3 py-2.5 md:justify-center md:px-0" : "gap-3 px-3 py-2.5"
  }`;

  const tooltipHandlers = collapsed
    ? {
        onMouseEnter: (event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onTooltipChange?.({
            label: item.label,
            top: rect.top + rect.height / 2,
            left: rect.right + 16,
          });
        },
        onMouseLeave: () => onTooltipChange?.(null),
      }
    : {};

  if (disabled) {
    return (
      <button
        type="button"
        className={`${baseClassName} w-full text-left`}
        onClick={() => onLockedPress?.(lockMessage || `${item.label} bloqueado`)}
        {...tooltipHandlers}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      className={baseClassName}
      onClick={onNavigate}
      {...tooltipHandlers}
    >
      {content}
    </Link>
  );
}

function SectionHeader({ label, collapsed = false }) {
  if (collapsed) {
    return (
      <>
        <div className="mb-2 mt-4 flex items-center gap-2 px-1 md:hidden">
          <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">{label}</p>
          <div className="h-px flex-1 bg-[rgba(15,23,42,0.08)]" />
        </div>
        <div className="my-3 hidden h-px bg-[rgba(15,23,42,0.08)] md:block" />
      </>
    );
  }

  return (
    <div className="mb-2 mt-4 flex items-center gap-2 px-1">
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">{label}</p>
      <div className="h-px flex-1 bg-[rgba(15,23,42,0.08)]" />
    </div>
  );
}

export default function Sidebar({
  role = "non_student",
  desktopOpen,
  mobileOpen,
  onCloseMobile,
  studyWithMeUnlocked = false,
  studyWithMeLockMessage = "Disponible solo para alumnos Premium.",
}) {
  const pathname = usePathname();
  const isLockedRole = role === "non_student";
  const [mobileLockedMessage, setMobileLockedMessage] = useState("");
  const [collapsedTooltip, setCollapsedTooltip] = useState(null);

  const isActive = (href) => {
    if (!href) return false;
    if (isLockedRole && pathname?.startsWith("/app/matricula") && href === STUDENT_DASHBOARD_ITEM.href) {
      return true;
    }
    if (href === "/app") return pathname === "/app";
    return pathname?.startsWith(href);
  };

  const handleLockedPress = (message) => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    setMobileLockedMessage(String(message || "Acceso bloqueado."));
  };

  const handleNavigate = () => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    onCloseMobile?.();
  };

  useEffect(() => {
    if (!mobileLockedMessage) return undefined;
    const timeoutId = window.setTimeout(() => setMobileLockedMessage(""), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [mobileLockedMessage]);

  useEffect(() => {
    const clearTooltip = () => setCollapsedTooltip(null);
    window.addEventListener("scroll", clearTooltip, true);
    window.addEventListener("resize", clearTooltip);
    return () => {
      window.removeEventListener("scroll", clearTooltip, true);
      window.removeEventListener("resize", clearTooltip);
    };
  }, []);

  const isDesktopCollapsed = !desktopOpen;
  const expandedDesktopClasses = desktopOpen
    ? "md:w-[246px] md:min-w-[246px] md:basis-[246px]"
    : "md:w-[78px] md:min-w-[78px] md:basis-[78px]";

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-[rgba(15,23,42,0.34)] backdrop-blur-[2px] transition-opacity md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onCloseMobile}
      />

      <aside
        className={`safe-area-top safe-area-bottom fixed inset-y-0 left-0 z-40 flex w-[78vw] max-w-[276px] flex-col border-r border-[rgba(15,23,42,0.08)] bg-white px-3 py-4 text-[#111827] shadow-[0_24px_64px_rgba(15,23,42,0.16)] transition-transform duration-300 md:static md:max-w-none md:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${expandedDesktopClasses}`}
      >
        <div className="flex h-full flex-col transition duration-200">
          <div className="flex items-center justify-between">
            <div className={`overflow-hidden ${isDesktopCollapsed ? "md:mx-auto" : ""}`}>
              {isDesktopCollapsed ? (
                <div className="flex items-center">
                  <div className="hidden md:flex">
                    <SidebarCollapsedLogo />
                  </div>
                  <div className="md:hidden">
                    <SidebarLogo />
                  </div>
                </div>
              ) : (
                <SidebarLogo />
              )}
            </div>
            <button
              type="button"
              onClick={onCloseMobile}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.08)] bg-white text-[#475569] transition hover:bg-[#f8fafc] md:hidden"
              aria-label="Cerrar menu"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto overflow-x-hidden pr-1">
            {mobileLockedMessage ? (
              <p className="mb-3 rounded-xl border border-[rgba(16,52,116,0.18)] bg-[#eef3ff] px-2.5 py-2 text-[12px] font-medium text-[#103474] md:hidden">
                {mobileLockedMessage}
              </p>
            ) : null}

            <NavItem
              item={STUDENT_DASHBOARD_ITEM}
              active={isActive(STUDENT_DASHBOARD_ITEM.href)}
              disabled={false}
              onNavigate={handleNavigate}
              collapsed={isDesktopCollapsed}
              onTooltipChange={setCollapsedTooltip}
            />

            {STUDENT_NAV_SECTIONS.map((section) => (
              <section key={section.id}>
                <SectionHeader label={section.label} collapsed={isDesktopCollapsed} />
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavItem
                      key={item.label}
                      item={item}
                      active={isActive(item.href)}
                      onLockedPress={handleLockedPress}
                      onNavigate={handleNavigate}
                      lockMessage={item.href === "/app/study-with-me" ? studyWithMeLockMessage : ""}
                      collapsed={isDesktopCollapsed}
                      onTooltipChange={setCollapsedTooltip}
                      disabled={
                        isLockedRole
                          ? true
                          : item.href === "/app/study-with-me" && !studyWithMeUnlocked
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-3 border-t border-[rgba(15,23,42,0.08)] pt-3">
            <a
              href={SUPPORT_URL || "https://wa.me/"}
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative inline-flex min-h-11 w-full items-center rounded-[12px] border border-[rgba(16,52,116,0.14)] bg-[#f8fbff] py-2.5 text-[14px] font-medium text-[#103474] transition hover:bg-[#eef3ff] ${
                isDesktopCollapsed ? "justify-center gap-2 px-3 md:px-0" : "justify-center gap-2 px-3"
              }`}
              onMouseEnter={(event) => {
                if (!isDesktopCollapsed) return;
                const rect = event.currentTarget.getBoundingClientRect();
                setCollapsedTooltip({
                  label: "Contactar soporte",
                  top: rect.top + rect.height / 2,
                  left: rect.right + 16,
                });
              }}
              onMouseLeave={() => setCollapsedTooltip(null)}
            >
              <Icon name="whatsapp" />
              <span className={isDesktopCollapsed ? "md:hidden" : ""}>Contactar soporte</span>
            </a>
          </div>
        </div>
      </aside>
      {collapsedTooltip ? (
        <div
          className="pointer-events-none fixed z-[70] hidden md:block"
          style={{ top: collapsedTooltip.top, left: collapsedTooltip.left, transform: "translateY(-50%)" }}
        >
          <div className="relative flex items-center rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#101827] px-3 py-2 text-[12px] font-medium tracking-[0.01em] text-white shadow-[0_18px_40px_rgba(15,23,42,0.32)]">
            <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-[#101827]" />
            <span className="relative">{collapsedTooltip.label}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
