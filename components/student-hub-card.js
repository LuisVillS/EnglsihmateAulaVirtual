"use client";

import Link from "next/link";

function CardIcon({ icon, colorClass = "text-[#103474]" }) {
  const className = `h-6 w-6 ${colorClass}`;

  switch (icon) {
    case "matricula":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 8h8M8 12h5M8 16h8" />
        </svg>
      );
    case "tramites":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 4.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V6a1.5 1.5 0 0 1 1-1.5Z" />
          <path d="M14 4.5V9h4" />
          <path d="M8 13h8M8 16h6" />
        </svg>
      );
    case "plan":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 6.5h16v11H4z" />
          <path d="M8 10h8M8 14h5" />
          <path d="M6.5 3.5h11" />
        </svg>
      );
    case "opportunities":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3.5 14.7 9l5.8.8-4.2 4.1 1 5.8L12 17l-5.3 2.7 1-5.8-4.2-4.1 5.8-.8Z" />
        </svg>
      );
    case "support":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 4" />
          <circle cx="12" cy="17.2" r=".8" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

export default function StudentHubCard({
  href = "#",
  title,
  description,
  eyebrow = "Sección",
  icon = "matricula",
  accentClass = "bg-[#dce8ff]",
  iconClass = "text-[#103474]",
}) {
  const isExternal = String(href || "").startsWith("http");
  const cardClassName =
    "group relative overflow-hidden rounded-[14px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.05)] transition hover:border-[rgba(16,52,116,0.16)] hover:shadow-[0_18px_34px_rgba(15,23,42,0.08)]";

  const content = (
    <>
      <div className={`pointer-events-none absolute -right-7 -top-7 h-28 w-28 rounded-full opacity-95 ${accentClass}`} />
      <div className="relative flex h-full flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-[75%]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">{eyebrow}</p>
            <h3 className="mt-2 text-[1.6rem] font-semibold leading-[1.1] text-[#111827]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p>
          </div>
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-white/80 bg-white/90 shadow-[0_10px_18px_rgba(15,23,42,0.08)]">
            <CardIcon icon={icon} colorClass={iconClass} />
          </div>
        </div>

        <span className="relative inline-flex items-center gap-2 text-sm font-semibold text-[#475569] transition group-hover:text-[#103474]">
          Más información
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cardClassName}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={cardClassName}>
      {content}
    </Link>
  );
}
