import { buildLibrarySavedPageNotice } from "@/lib/library/read-state";

export default function LibraryReaderResumeNotice({ pageNumber }) {
  const title = buildLibrarySavedPageNotice(pageNumber);
  if (!title) return null;

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-foreground">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted">
        We&apos;ll try to reopen the book on this page next time. If the book does not reopen there automatically, go to{" "}
        page {pageNumber}.
      </p>
    </div>
  );
}
