"use client";

import { useState } from "react";

export default function LibraryMyLibraryButton({
  slug,
  initialInMyLibrary = false,
  compact = false,
  className = "",
}) {
  const [inMyLibrary, setInMyLibrary] = useState(Boolean(initialInMyLibrary));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggleLibraryState() {
    if (!slug || pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/library/books/${slug}/my-library`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inMyLibrary: !inMyLibrary }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo actualizar My Library.");
      }

      setInMyLibrary(Boolean(payload?.readState?.inMyLibrary));
    } catch (requestError) {
      setError(requestError?.message || "No se pudo actualizar My Library.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        type="button"
        onClick={toggleLibraryState}
        disabled={pending}
        className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 font-semibold transition ${
          inMyLibrary
            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
            : "border-border bg-surface text-foreground hover:border-primary/35 hover:bg-surface-2"
        } ${compact ? "text-xs" : "text-sm"} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pending ? "Saving..." : inMyLibrary ? "Remove from My Library" : "Add to My Library"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
