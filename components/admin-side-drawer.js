"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function AdminSideDrawer({
  open,
  onClose,
  title,
  description = "",
  children,
  widthClass = "max-w-[440px]",
}) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1300]" onMouseDown={() => onClose?.()}>
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.42)] backdrop-blur-[2px]" />
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <aside
          className={`flex h-full w-full ${widthClass} flex-col overflow-hidden border-l border-[rgba(15,23,42,0.08)] bg-white shadow-[0_28px_70px_rgba(15,23,42,0.18)]`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-5 py-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-[#111827]">{title}</p>
              {description ? <p className="mt-1 text-sm text-[#64748b]">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] text-[#475569] transition hover:border-[rgba(16,52,116,0.2)] hover:bg-[#f8fbff] hover:text-[#103474]"
              aria-label="Cerrar panel"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#fcfdff] px-5 py-5">{children}</div>
        </aside>
      </div>
    </div>,
    document.body
  );
}
