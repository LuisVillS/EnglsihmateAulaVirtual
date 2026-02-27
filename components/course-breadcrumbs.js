import Link from "next/link";

export default function CourseBreadcrumbs({ items = [] }) {
  const normalized = Array.isArray(items)
    ? items
        .map((item) => ({
          label: String(item?.label || "").trim(),
          href: String(item?.href || "").trim(),
        }))
        .filter((item) => item.label)
    : [];

  if (!normalized.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center">
      <ol className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted sm:text-sm">
        {normalized.map((item, index) => {
          const isLast = index === normalized.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {item.href && !isLast ? (
                <Link href={item.href} className="rounded-md px-1 py-0.5 transition hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "text-foreground" : "text-muted"}>{item.label}</span>
              )}
              {!isLast ? <span className="text-muted/70">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
