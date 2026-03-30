"use client";

import { useRouter } from "next/navigation";

export default function CrmRouteButton({ href, className = "", children, disabled = false }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (!href || disabled) return;
        router.push(href);
      }}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}
