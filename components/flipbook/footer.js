"use client";

export default function FlipbookFooter({
  chapterLabel = "",
  spreadLabel = "",
  savedLabel = "",
}) {
  return (
    <div className="pointer-events-auto flex items-center justify-between gap-3 border border-white/10 bg-black/25 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/62 backdrop-blur-xl">
      <span className="truncate">{chapterLabel || "Reading stage"}</span>
      <span className="truncate">{savedLabel || spreadLabel}</span>
    </div>
  );
}
