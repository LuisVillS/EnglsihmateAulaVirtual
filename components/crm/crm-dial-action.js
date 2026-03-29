"use client";

export default function CrmDialAction({
  href,
  label = "Call",
  className = "",
  disabledClassName = "",
  disabledLabel = "No phone number",
}) {
  if (!href) {
    return (
      <span
        className={
          disabledClassName ||
          "inline-flex min-h-11 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-5 text-sm font-semibold text-[#94a3b8]"
        }
      >
        {disabledLabel}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.preventDefault();
        const launched =
          typeof window !== "undefined"
            ? window.open(href, "_blank", "noopener,noreferrer")
            : null;

        if (!launched && typeof window !== "undefined") {
          window.location.assign(href);
        }
      }}
      className={className}
    >
      {label}
    </a>
  );
}
