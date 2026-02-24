"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { approvePreEnrollment, rejectPreEnrollment } from "@/app/admin/prematriculas/actions";

const MENU_WIDTH = 220;
const MENU_MARGIN = 8;

function calculateMenuPosition(rect, menuHeight = 140) {
  if (!rect) {
    return null;
  }

  let left = rect.right - MENU_WIDTH;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (left < 12) {
    left = 12;
  }
  if (left + MENU_WIDTH > viewportWidth - 12) {
    left = viewportWidth - MENU_WIDTH - 12;
  }

  let top = rect.bottom + MENU_MARGIN;
  if (top + menuHeight > viewportHeight - 12) {
    top = Math.max(12, rect.top - menuHeight - MENU_MARGIN);
  }

  return { top, left };
}

export default function PreEnrollmentRowActions({ preEnrollmentId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [menuStyle, setMenuStyle] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const anchorRectRef = useRef(null);

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
    setMenuStyle(calculateMenuPosition(rect));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !buttonRef.current?.contains(event.target)
      ) {
        closeMenu();
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }
    function handleViewportChange() {
      closeMenu();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !anchorRectRef.current) return;
    const rect = anchorRectRef.current;
    const measuredHeight = menuRef.current.offsetHeight || 140;
    const nextStyle = calculateMenuPosition(rect, measuredHeight);
    if (nextStyle && (nextStyle.top !== menuStyle?.top || nextStyle.left !== menuStyle?.left)) {
      setMenuStyle(nextStyle);
    }
  }, [open, menuStyle]);

  const handleApprove = () => {
    if (!window.confirm("Confirmar aprobacion de esta pre-matricula?")) {
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append("preEnrollmentId", preEnrollmentId);
      const result = await approvePreEnrollment(formData);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      closeMenu();
      router.refresh();
    });
  };

  const handleReject = () => {
    const notes = window.prompt("Motivo de rechazo (opcional):", "");
    if (notes === null) {
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append("preEnrollmentId", preEnrollmentId);
      if (notes.trim()) {
        formData.append("reviewNotes", notes.trim());
      }
      const result = await rejectPreEnrollment(formData);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      closeMenu();
      router.refresh();
    });
  };

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
              zIndex: 10000,
            }}
            className="rounded-2xl border border-border bg-surface p-2 text-sm text-foreground shadow-2xl shadow-black/35"
          >
            <button
              type="button"
              disabled={isPending}
              onClick={handleApprove}
              className="block w-full rounded-xl px-3 py-2 text-left text-success transition hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Aprobar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleReject}
              className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Rechazar
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        onClick={toggleMenu}
        ref={buttonRef}
        className="rounded-full border border-border p-2 text-muted transition hover:border-primary hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Acciones de pre-matricula"
      >
        <span className="text-lg leading-none">{isPending ? "..." : "\u22EE"}</span>
      </button>
      {menu}
    </div>
  );
}
