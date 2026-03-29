"use client";

import { useEffect, useId } from "react";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

export default function CrmModal({
  open,
  onClose,
  title,
  description,
  tone = "default",
  children,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const toneClasses = {
    default: "border-[rgba(15,23,42,0.08)] bg-white",
    danger: "border-[rgba(239,68,68,0.22)] bg-[rgba(255,250,250,0.98)]",
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(15,23,42,0.55)] px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className={joinClasses(
          "w-full max-w-2xl rounded-[28px] border p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]",
          toneClasses[tone] || toneClasses.default
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p
              id={titleId}
              className="text-lg font-semibold tracking-[-0.02em] text-[#111827]"
            >
              {title}
            </p>
            {description ? (
              <p className="max-w-xl text-sm leading-6 text-[#64748b]">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(15,23,42,0.1)] bg-white text-lg text-[#475569] transition hover:border-[rgba(16,52,116,0.18)] hover:text-[#103474]"
            aria-label="Close dialog"
          >
            x
          </button>
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
