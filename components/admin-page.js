"use client";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

export function AdminPage({ children, className = "" }) {
  return <section className={joinClasses("space-y-4 px-4 py-4 sm:px-6 sm:py-5", className)}>{children}</section>;
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions = null,
  compact = false,
}) {
  return (
    <header
      className={joinClasses(
        "flex flex-col gap-3 rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white px-5 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)] sm:px-6",
        compact ? "sm:flex-row sm:items-start sm:justify-between" : "lg:flex-row lg:items-start lg:justify-between"
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">{eyebrow}</p>
        ) : null}
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-[#111827]">{title}</h1>
        {description ? <p className="max-w-3xl text-sm text-[#64748b]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function AdminCard({ children, className = "" }) {
  return (
    <div
      className={joinClasses(
        "rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_16px_32px_rgba(15,23,42,0.05)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AdminSectionHeader({ eyebrow, title, description, meta = null, actions = null }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">{eyebrow}</p>
        ) : null}
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-[#111827]">{title}</h2>
        {description ? <p className="text-sm text-[#64748b]">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
        {meta}
        {actions}
      </div>
    </div>
  );
}

export function AdminStatsGrid({ children, className = "" }) {
  return <div className={joinClasses("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function AdminStatCard({ label, value, hint = "" }) {
  return (
    <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none text-[#111827]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#64748b]">{hint}</p> : null}
    </div>
  );
}

export function AdminBadge({ children, tone = "neutral", className = "" }) {
  const toneClasses = {
    neutral: "border-[rgba(15,23,42,0.08)] bg-[#f8fafc] text-[#475569]",
    accent: "border-[rgba(16,52,116,0.16)] bg-[#eef3ff] text-[#103474]",
    success: "border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.08)] text-[#047857]",
    warning: "border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.08)] text-[#b45309]",
    danger: "border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] text-[#b91c1c]",
  };

  return (
    <span
      className={joinClasses(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        toneClasses[tone] || toneClasses.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}

export function AdminPrimaryLink({ href, children, className = "" }) {
  return (
    <a
      href={href}
      className={joinClasses(
        "inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]",
        className
      )}
    >
      {children}
    </a>
  );
}

export function AdminSecondaryLink({ href, children, className = "" }) {
  return (
    <a
      href={href}
      className={joinClasses(
        "inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]",
        className
      )}
    >
      {children}
    </a>
  );
}

export function AdminToolbar({ children, className = "" }) {
  return (
    <div
      className={joinClasses(
        "sticky top-[84px] z-20 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-white/95 p-3 shadow-[0_16px_32px_rgba(15,23,42,0.05)] backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AdminEmptyState({ title, description }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[#f8fafc] px-6 py-10 text-center">
      <p className="text-lg font-semibold text-[#111827]">{title}</p>
      <p className="mt-2 text-sm text-[#64748b]">{description}</p>
    </div>
  );
}
