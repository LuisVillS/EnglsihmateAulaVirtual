"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteStudent } from "@/app/admin/actions";
import AppModal from "@/components/app-modal";

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

export default function StudentRowActions({ studentId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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

  const handleDeleteClick = () => {
    closeMenu();
    setDeleteError("");
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("profileId", studentId);
      const result = await deleteStudent(formData);
      if (result?.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
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
            {/* Portal evita que el overflow del contenedor recorte el menu */}
            <Link
              href={`/admin/students/${studentId}`}
              prefetch={false}
              onClick={closeMenu}
              className="block rounded-xl px-3 py-2 text-[#0f172a] transition hover:bg-[#f8fbff]"
            >
              Abrir ficha completa
            </Link>
            <button
              type="button"
              disabled={isPending}
              className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleDeleteClick}
            >
              Eliminar alumno...
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
        className="rounded-xl border border-[rgba(15,23,42,0.1)] p-2 text-[#64748b] transition hover:border-[rgba(16,52,116,0.22)] hover:bg-[#f8fbff] hover:text-[#103474]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Acciones del alumno"
      >
        <span className="text-lg leading-none">{isPending ? "..." : "\u22EE"}</span>
      </button>
      {menu}
      <AppModal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar alumno" widthClass="max-w-xl">
        <div className="space-y-4">
          <p className="text-sm text-[#475569]">
            Esta accion eliminara el perfil del alumno y sus inscripciones actuales. No cambia la logica del sistema,
            pero si remueve el registro de forma inmediata.
          </p>
          {deleteError ? (
            <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={confirmDelete}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#b91c1c] px-4 text-sm font-semibold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Eliminando..." : "Confirmar eliminacion"}
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
