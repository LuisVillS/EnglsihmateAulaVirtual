"use client";

import { useState } from "react";
import LibrarySavedPageBadge from "@/components/library-saved-page-badge";

export default function LibrarySavePlaceControl({
  savedPageNumber = null,
  saving = false,
  onSavePlace,
  onClearPlace,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageNumber, setPageNumber] = useState(savedPageNumber ? String(savedPageNumber) : "");
  const [error, setError] = useState("");

  async function handleSave(event) {
    event.preventDefault();
    setError("");

    const numeric = Number(pageNumber);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      setError("Page number must be a positive integer.");
      return;
    }

    try {
      await onSavePlace?.(numeric);
      setIsOpen(false);
    } catch (requestError) {
      setError(requestError?.message || "No se pudo guardar la pagina.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setPageNumber(savedPageNumber ? String(savedPageNumber) : "");
          setError("");
          setIsOpen((previous) => !previous);
        }}
        className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
      >
        Save My Place
      </button>

      <LibrarySavedPageBadge pageNumber={savedPageNumber} compact />

      {isOpen ? (
        <form onSubmit={handleSave} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Page number</label>
          <input
            value={pageNumber}
            onChange={(event) => setPageNumber(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            placeholder="170"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {onClearPlace && savedPageNumber ? (
            <button
              type="button"
              onClick={async () => {
                setError("");
                try {
                  await onClearPlace();
                  setIsOpen(false);
                } catch (requestError) {
                  setError(requestError?.message || "No se pudo borrar la pagina guardada.");
                }
              }}
              disabled={saving}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear
            </button>
          ) : null}
          {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
