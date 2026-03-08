"use client";

import { getLibraryFullscreenButtonLabel } from "@/lib/library/reader-ui";

function FullscreenEnterIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M6 3.5H3.5V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3.5h2.5V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 16.5H3.5V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 16.5h2.5V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FullscreenExitIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M7 3.5H3.5V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 3.5h3.5V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16.5H3.5V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 16.5h3.5V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8l-2.5-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 8l2.5-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 12l-2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function LibraryReaderFullscreenButton({
  supported = false,
  isFullscreen = false,
  onToggle,
}) {
  if (!supported) return null;

  const label = getLibraryFullscreenButtonLabel(isFullscreen);

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:bg-surface-2"
    >
      {isFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
