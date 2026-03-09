"use client";

import { useEffect, useRef, useState } from "react";
import {
  getLibraryBookmarkButtonLabel,
  getLibraryBookmarkSavedText,
  getLibraryBookmarkValidationError,
  getLibraryFloatingBookmarkPanelClasses,
  hasLibraryBookmarkDraftChange,
} from "@/lib/library/reader-ui";

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M6.5 3.5h7a1 1 0 0 1 1 1v12l-4.5-2.7-4.5 2.7v-12a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LibraryFloatingBookmarkPanel({
  savedPageNumber = null,
  savedPageCode = "",
  detectedPageNumber = null,
  detectedPageCode = "",
  saving = false,
  isMobile = false,
  isFullscreen = false,
  onSavePlace,
  onClearPlace,
}) {
  const [pageNumber, setPageNumber] = useState(savedPageNumber ? String(savedPageNumber) : "");
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const successTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const savedLabel = getLibraryBookmarkSavedText(savedPageNumber, savedPageCode);
  const hasUnsavedChange = hasLibraryBookmarkDraftChange({ value: pageNumber, savedPageNumber });
  const detectedLabel = detectedPageNumber
    ? `Current page detected: ${detectedPageNumber}`
    : detectedPageCode
      ? "Current reader position detected"
      : "";

  async function handleSave(event) {
    event.preventDefault();
    const effectivePageNumber = pageNumber || detectedPageNumber || "";
    const validationError = getLibraryBookmarkValidationError(effectivePageNumber, {
      detectedPageCode,
    });
    setError(validationError);

    if (validationError) {
      setSaveSuccess(false);
      return;
    }

    try {
      await onSavePlace?.(Number(effectivePageNumber) || null, {
        pageCode: detectedPageCode || "",
      });
      setSaveSuccess(true);
      setError("");
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = window.setTimeout(() => {
        setSaveSuccess(false);
      }, 1800);
    } catch (requestError) {
      setSaveSuccess(false);
      setError(requestError?.message || "No se pudo guardar la pagina.");
    }
  }

  async function handleClear() {
    if (!onClearPlace) return;
    setError("");

    try {
      await onClearPlace();
      setPageNumber("");
      setSaveSuccess(false);
    } catch (requestError) {
      setError(requestError?.message || "No se pudo borrar la pagina guardada.");
    }
  }

  return (
    <aside className={getLibraryFloatingBookmarkPanelClasses({ isMobile, isFullscreen })}>
      <form
        onSubmit={handleSave}
        className="pointer-events-auto space-y-3 border border-border bg-background/96 p-4 shadow-[0_18px_40px_rgba(12,18,31,0.18)] backdrop-blur"
        style={{ borderRadius: "16px" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BookmarkIcon />
              <span>Bookmark</span>
            </div>
            <p className="text-xs leading-5 text-muted">Don&apos;t forget to save your page number</p>
          </div>
        </div>

        {savedLabel ? (
          <p className="text-xs font-medium text-foreground/85">{savedLabel}</p>
        ) : (
          <p className="text-xs text-muted">No bookmark saved yet.</p>
        )}
        {detectedLabel ? <p className="text-[11px] text-muted">{detectedLabel}</p> : null}

        <div className="space-y-2">
          <label htmlFor="library-bookmark-page-number" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Page number
          </label>
          <input
            suppressHydrationWarning
            id="library-bookmark-page-number"
            type="number"
            min="1"
            step="1"
            value={pageNumber}
            onChange={(event) => {
              setPageNumber(event.target.value);
              if (error) {
                setError("");
              }
              if (saveSuccess) {
                setSaveSuccess(false);
              }
            }}
            inputMode="numeric"
            className="w-full border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            style={{ borderRadius: "12px" }}
            placeholder={detectedPageNumber ? String(detectedPageNumber) : "170"}
          />
        </div>

        <div className="space-y-2">
          <button
            suppressHydrationWarning
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center border border-primary bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderRadius: "12px" }}
          >
            {getLibraryBookmarkButtonLabel({ saving, saveSuccess })}
          </button>

          <div className="flex min-h-5 items-center justify-between gap-3 text-xs">
            <span className={hasUnsavedChange ? "text-muted" : "text-transparent"}>Unsaved change</span>
            {onClearPlace && savedPageNumber ? (
              <button
                suppressHydrationWarning
                type="button"
                onClick={handleClear}
                disabled={saving}
                className="font-medium text-muted transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear bookmark
              </button>
            ) : null}
          </div>

          {error ? <p className="text-xs text-danger">{error}</p> : null}
          {!error && saveSuccess ? <p className="text-xs text-primary">Bookmark saved</p> : null}
        </div>
      </form>
    </aside>
  );
}
