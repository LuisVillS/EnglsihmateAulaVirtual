"use client";

import Link from "next/link";

export default function FlipbookHeader({
  slug = "",
  title = "",
}) {
  return (
    <div className="pointer-events-auto mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 rounded-[18px] border px-3 py-2.5 text-[var(--flipbook-stage-header-text)] shadow-[0_16px_38px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:px-4" style={{ background: "var(--flipbook-stage-header-bg)", borderColor: "var(--flipbook-stage-header-border)" }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Link href={`/app/library/book/${slug}`} className="inline-flex h-9 items-center rounded-[12px] border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/78 transition hover:bg-white/[0.1] hover:text-white">
          Back
        </Link>
        <p className="hidden truncate text-sm font-semibold text-white/88 sm:block">{title}</p>
      </div>

      <Link href="/app/library" className="inline-flex h-9 items-center rounded-[12px] border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/78 transition hover:bg-white/[0.1] hover:text-white">
        Library
      </Link>
    </div>
  );
}
