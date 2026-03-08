"use client";

import { useState } from "react";

export default function LibraryFavoriteButton({
  slug,
  initialFavorite = false,
  compact = false,
  className = "",
}) {
  const [favorite, setFavorite] = useState(Boolean(initialFavorite));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggleFavorite() {
    if (!slug || pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/library/books/${slug}/favorite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ favorite: !favorite }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo actualizar favorito.");
      }

      setFavorite(Boolean(payload?.favorite));
    } catch (requestError) {
      setError(requestError?.message || "No se pudo actualizar favorito.");
    } finally {
      setPending(false);
    }
  }

  const label = favorite ? "Saved" : "Save";

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={pending}
        className={`inline-flex items-center justify-center rounded-full border px-4 py-2 font-semibold transition ${
          favorite
            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
            : "border-border bg-surface text-foreground hover:border-primary/35 hover:bg-surface-2"
        } ${compact ? "text-xs" : "text-sm"} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pending ? "Saving..." : label}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

