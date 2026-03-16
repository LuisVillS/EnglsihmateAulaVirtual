"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const MENU_WIDTH = 240;
const MENU_OFFSET = 8;

function getInitial(name, email) {
  const source = name?.trim() || email || "";
  return source.charAt(0).toUpperCase() || "U";
}

function computeMenuPosition(rect, menuHeight = 120) {
  if (!rect) return null;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.right - MENU_WIDTH;
  if (left < 12) left = 12;
  if (left + MENU_WIDTH > viewportWidth - 12) {
    left = viewportWidth - MENU_WIDTH - 12;
  }

  let top = rect.bottom + MENU_OFFSET;
  if (top + menuHeight > viewportHeight - 12) {
    top = Math.max(12, rect.top - menuHeight - MENU_OFFSET);
  }

  return { top, left };
}

export default function UserAvatarMenu({ name, email, avatarUrl }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const anchorRectRef = useRef(null);
  const initial = getInitial(name, email);

  const closeMenu = () => {
    setOpen(false);
    setMenuStyle(null);
  };

  const toggleMenu = () => {
    if (open) {
      closeMenu();
      return;
    }
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    anchorRectRef.current = rect;
    setMenuStyle(computeMenuPosition(rect));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !buttonRef.current?.contains(event.target)
      ) {
        closeMenu();
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    const handleViewportChange = () => {
      closeMenu();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !anchorRectRef.current) return;
    const nextStyle = computeMenuPosition(anchorRectRef.current, menuRef.current.offsetHeight || 120);
    if (nextStyle && (nextStyle.top !== menuStyle?.top || nextStyle.left !== menuStyle?.left)) {
      setMenuStyle(nextStyle);
    }
  }, [open, menuStyle]);

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              width: MENU_WIDTH,
              zIndex: 9999,
            }}
            className="rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4 text-sm text-[#111827] shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
          >
            {/* Portal: asegura que el menu flote por encima del layout */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(16,52,116,0.16)] bg-[#eef3ff] text-sm font-semibold text-[#103474]">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={name || email || "Usuario"}
                    width={48}
                    height={48}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#111827]">{name || email || "Usuario"}</p>
                <p className="truncate text-xs text-[#64748b]">{email || "Perfil del estudiante"}</p>
                <Link
                  href="/profile"
                  onClick={closeMenu}
                  className="mt-1 inline-flex text-xs font-semibold text-[#103474] hover:text-[#0c295a]"
                >
                  Mi perfil
                </Link>
              </div>
            </div>
            <div className="my-4 h-px w-full bg-[rgba(15,23,42,0.08)]" />
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-[#334155] transition hover:bg-[#f7f9ff] hover:text-[#111827]"
              onClick={async () => {
                closeMenu();
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
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f6f8fc] text-[#103474]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M9 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
                  <path d="M3 12h10" />
                  <path d="M9 8l4 4-4 4" />
                </svg>
              </span>
              Cerrar sesion
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={toggleMenu}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(16,52,116,0.22)] bg-white text-sm font-semibold text-[#103474] shadow-[0_8px_22px_rgba(15,23,42,0.08)] transition hover:border-[#103474] hover:bg-[#f8faff]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#eef3ff] text-[#103474]">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={name || email || "Usuario"}
              width={28}
              height={28}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initial
          )}
        </span>
      </button>
      {menu}
    </div>
  );
}
