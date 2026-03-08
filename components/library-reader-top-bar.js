"use client";

import Link from "next/link";
import LibraryMyLibraryButton from "@/components/library-my-library-button";

export default function LibraryReaderTopBar({
  slug,
  title,
  progressText,
  inMyLibrary = false,
}) {
  return (
    <div className="border-b border-border bg-background/94 px-4 py-4 backdrop-blur sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Link href={`/app/library/book/${slug}`} className="text-xs uppercase tracking-[0.24em] text-muted hover:text-primary">
            Back to details
          </Link>
          <div>
            <h1 className="truncate text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted">{progressText}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <LibraryMyLibraryButton slug={slug} initialInMyLibrary={inMyLibrary} compact />
          <Link
            href="/app/library"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:bg-surface-2"
          >
            Library
          </Link>
        </div>
      </div>
    </div>
  );
}
