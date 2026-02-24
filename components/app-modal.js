"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function AppModal({ open, onClose, title, widthClass = "max-w-3xl", children }) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
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
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 p-4"
      onMouseDown={() => onClose?.()}
    >
      <div
        className={`relative w-full ${widthClass} max-h-[92vh] overflow-hidden rounded-3xl border border-border bg-surface text-foreground shadow-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm font-semibold text-foreground transition hover:border-primary/60"
            aria-label="Cerrar"
          >
            X
          </button>
        </div>
        <div className="max-h-[calc(92vh-65px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
