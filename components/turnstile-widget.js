"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

function hasTurnstile() {
  return typeof window !== "undefined" && typeof window.turnstile?.render === "function";
}

export default function TurnstileWidget({
  siteKey,
  onTokenChange,
  className = "",
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!scriptLoaded || !siteKey || !containerRef.current || !hasTurnstile()) {
      return;
    }

    if (widgetIdRef.current != null) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // no-op
      }
      widgetIdRef.current = null;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onTokenChange?.(token || ""),
      "expired-callback": () => onTokenChange?.(""),
      "error-callback": () => onTokenChange?.(""),
    });

    return () => {
      if (widgetIdRef.current != null && hasTurnstile()) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // no-op
        }
        widgetIdRef.current = null;
      }
    };
  }, [onTokenChange, scriptLoaded, siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div ref={containerRef} className={className} />
    </>
  );
}
