import { formatLibrarySavedPage } from "@/lib/library/read-state";

export default function LibrarySavedPageBadge({ pageNumber, compact = false }) {
  const label = formatLibrarySavedPage(pageNumber);
  if (!label) return null;

  return (
    <span
      className={`inline-flex rounded-lg border border-primary/25 bg-primary/10 px-3 py-1 font-semibold text-primary ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      {label}
    </span>
  );
}
