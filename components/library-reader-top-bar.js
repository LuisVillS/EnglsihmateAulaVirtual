"use client";

import Link from "next/link";

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M11.75 4.75 6.5 10l5.25 5.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LibraryReaderTopBar({
  slug,
  title,
  progressText,
  subtitle = "",
  immersive = false,
  isMobile = false,
  chromeVisible = true,
}) {
  const wrapperClass = immersive
    ? `absolute inset-x-2 top-2 z-20 transition duration-300 sm:inset-x-4 sm:top-4 ${
        chromeVisible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
      }`
    : "border-b border-border bg-background/94 px-4 py-4 backdrop-blur sm:px-5";

  const shellClass = immersive
    ? `mx-auto flex w-full max-w-[1120px] items-start justify-between gap-3 border border-white/10 bg-black/24 text-white shadow-[0_16px_38px_rgba(0,0,0,0.24)] backdrop-blur-xl ${
        isMobile ? "px-2.5 py-2" : "px-3 py-2.5 sm:px-3.5"
      }`
    : "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between";

  return (
    <div className={wrapperClass}>
      <div className={shellClass} style={{ borderRadius: immersive ? "18px" : undefined }}>
        <div className="min-w-0 flex-1">
          {immersive ? (
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-2.5">
                <Link
                  href={`/app/library/book/${slug}`}
                  className={`inline-flex flex-none items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] text-white/78 transition hover:bg-white/[0.1] hover:text-white ${
                    isMobile ? "h-8 w-8" : "h-9 w-9"
                  }`}
                  aria-label="Back to book details"
                >
                  <BackIcon />
                </Link>
                <h1 className={`truncate font-semibold text-white ${isMobile ? "text-[15px]" : "text-base sm:text-lg"}`}>{title}</h1>
              </div>
              <p className={`truncate text-white/55 ${isMobile ? "pl-[2.55rem] text-[11px]" : "pl-[2.9rem] text-[12px]"}`}>
                {subtitle || progressText}
              </p>
            </div>
          ) : (
            <div className="min-w-0 space-y-1.5">
              <Link
                href={`/app/library/book/${slug}`}
                className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted hover:text-primary"
              >
                <BackIcon />
                Book details
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-foreground">{title}</h1>
                <p className="truncate text-sm text-muted">{subtitle || progressText}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Link
            href="/app/library"
            className={`inline-flex items-center justify-center border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
              immersive
                ? "border-white/10 bg-white/[0.04] text-white/78 hover:bg-white/[0.1] hover:text-white"
                : "border-border bg-surface text-foreground hover:border-primary/35 hover:bg-surface-2"
            }`}
            style={{ borderRadius: "12px" }}
          >
            Library
          </Link>
        </div>
      </div>
    </div>
  );
}
