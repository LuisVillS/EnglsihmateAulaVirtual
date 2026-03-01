"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function ProviderLinkButton({
  provider,
  redirectPath = "/profile",
  openInNewWindow = false,
  label = "Conectar",
  loadingLabel = "Conectando...",
  className = "rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60",
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    if (!provider || loading) return;
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const origin = window.location.origin || "";
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${origin}${redirectPath}` },
      });

      if (error || !data?.url) {
        const debugParts = [error?.code, error?.status, error?.message].filter(Boolean).join(" | ");
        const message = encodeURIComponent(debugParts || "No pudimos iniciar la vinculacion.");
        router.push(`${redirectPath}?error=${message}`);
        return;
      }

      if (openInNewWindow) {
        const popup = window.open(data.url, "_blank", "noopener,noreferrer");
        if (!popup) {
          window.location.href = data.url;
        }
        return;
      }

      window.location.href = data.url;
    } catch (error) {
      const message = encodeURIComponent(error?.message || "No pudimos iniciar la vinculacion.");
      router.push(`${redirectPath}?error=${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
