"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function AppModal({
  open,
  onClose,
  title,
  widthClass = "max-w-3xl",
  dismissible = true,
  fullScreen = false,
  children,
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && dismissible) onClose?.();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissible, open, onClose]);

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[1200] flex bg-[rgba(15,23,42,0.58)] ${fullScreen ? "items-stretch justify-stretch p-0" : "items-center justify-center p-4"}`}
      onMouseDown={() => {
        if (dismissible) onClose?.();
      }}
    >
      <div
        className={`relative w-full ${widthClass} overflow-hidden border border-[rgba(15,23,42,0.08)] bg-white text-[#0f172a] shadow-[0_28px_70px_rgba(15,23,42,0.22)] ${fullScreen ? "h-full max-h-none rounded-none" : "max-h-[92vh] rounded-[28px]"}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] text-base font-semibold text-[#475569] transition hover:border-[rgba(16,52,116,0.28)] hover:bg-[#f1f7ff] hover:text-[#103474]"
              aria-label="Cerrar"
            >
              X
            </button>
          ) : null}
        </div>
        <div className={`${fullScreen ? "h-[calc(100%-65px)]" : "max-h-[calc(92vh-65px)]"} overflow-y-auto bg-[#fcfdff] p-5`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
