"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { approvePreEnrollment, rejectPreEnrollment } from "@/app/admin/prematriculas/actions";
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

export default function PreEnrollmentRowActions({ preEnrollmentId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionError, setActionError] = useState("");
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
    closeMenu();
    setActionError("");
    setReviewNotes("");
    setApproveOpen(true);
  };

  const confirmApprove = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("preEnrollmentId", preEnrollmentId);
      const result = await approvePreEnrollment(formData);
      if (result?.error) {
        setActionError(result.error);
        return;
      }
      setActionError("");
      setApproveOpen(false);
      router.refresh();
    });
  };

  const handleReject = () => {
    closeMenu();
    setActionError("");
    setReviewNotes("");
    setRejectOpen(true);
  };

  const confirmReject = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("preEnrollmentId", preEnrollmentId);
      if (reviewNotes.trim()) {
        formData.append("reviewNotes", reviewNotes.trim());
      }
      const result = await rejectPreEnrollment(formData);
      if (result?.error) {
        setActionError(result.error);
        return;
      }
      setActionError("");
      setReviewNotes("");
      setRejectOpen(false);
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
              className="block w-full rounded-xl px-3 py-2 text-left text-[#047857] transition hover:bg-[rgba(16,185,129,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Aprobar...
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleReject}
              className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Rechazar...
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
        aria-label="Acciones de pre-matricula"
      >
        <span className="text-lg leading-none">{isPending ? "..." : "\u22EE"}</span>
      </button>
      {menu}
      <AppModal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Aprobar pre-matricula"
        widthClass="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#475569]">
            Esta accion ejecuta la aprobacion actual del sistema y matriculara al alumno con la configuracion ya
            seleccionada.
          </p>
          {actionError ? (
            <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {actionError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setApproveOpen(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={confirmApprove}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Aprobando..." : "Confirmar aprobacion"}
            </button>
          </div>
        </div>
      </AppModal>
      <AppModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Rechazar pre-matricula"
        widthClass="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#475569]">
            La pre-matricula se marcara como rechazada con el mismo flujo actual. Puedes dejar una nota opcional para
            registrar el motivo.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              Motivo de rechazo
            </label>
            <textarea
              rows={4}
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              placeholder="Escribe una nota opcional para el equipo."
            />
          </div>
          {actionError ? (
            <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {actionError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={confirmReject}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#b91c1c] px-4 text-sm font-semibold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Rechazando..." : "Confirmar rechazo"}
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
