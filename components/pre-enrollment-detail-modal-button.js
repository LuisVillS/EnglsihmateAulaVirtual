"use client";

import { useEffect, useMemo, useState } from "react";

export default function PreEnrollmentDetailModalButton({
  preEnrollmentId,
  label = "Ver detalle",
  className = "rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary",
}) {
  const [open, setOpen] = useState(false);
  const detailUrl = useMemo(
    () => `/admin/prematriculas/${encodeURIComponent(preEnrollmentId)}`,
    [preEnrollmentId]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative h-[90vh] w-full max-w-6xl rounded-2xl border border-border bg-surface shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-sm font-bold text-foreground transition hover:border-primary"
              aria-label="Cerrar"
            >
              X
            </button>
            <iframe
              src={detailUrl}
              title="Detalle de pre-matricula"
              className="h-full w-full rounded-2xl"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
