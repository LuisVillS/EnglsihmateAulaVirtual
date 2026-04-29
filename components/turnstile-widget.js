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
  const [renderReady, setRenderReady] = useState(false);

  useEffect(() => {
    if (!scriptLoaded) return;

    let cancelled = false;
    let attempts = 0;

    const checkReady = () => {
      if (cancelled) return;
      if (hasTurnstile()) {
        setRenderReady(true);
        return;
      }

      attempts += 1;
      if (attempts < 40) {
        window.setTimeout(checkReady, 150);
      }
    };

    checkReady();

    return () => {
      cancelled = true;
      setRenderReady(false);
    };
  }, [scriptLoaded]);

  useEffect(() => {
    if (!renderReady || !siteKey || !containerRef.current || !hasTurnstile()) {
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
  }, [onTokenChange, renderReady, siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div className={className}>
        {!renderReady ? <p className="text-xs text-muted">Cargando verificacion anti-spam...</p> : null}
        <div ref={containerRef} />
      </div>
    </>
  );
}
