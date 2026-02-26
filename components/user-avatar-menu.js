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
            className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground shadow-2xl shadow-black/35"
          >
            {/* Portal: asegura que el menu flote por encima del layout */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2 text-sm font-semibold text-foreground">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={name || email || "Usuario"}
                    width={40}
                    height={40}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name || email || "Usuario"}</p>
                <Link
                  href="/profile"
                  onClick={closeMenu}
                  className="text-xs font-semibold text-primary hover:text-primary-2"
                >
                  Mi perfil
                </Link>
              </div>
            </div>
            <div className="my-3 h-px w-full bg-border" />
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground/90 transition hover:bg-surface-2"
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
              <span className="text-base">{'>'}</span>
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
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white shadow-inner"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={name || email || "Usuario"}
            width={40}
            height={40}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          initial
        )}
      </button>
      {menu}
    </div>
  );
}
