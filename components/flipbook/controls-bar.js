"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FLIPBOOK_THEME_OPTIONS } from "@/lib/flipbook-core/themes";

function isSkippedTocItem(item = null) {
  const href = String(item?.href || "");
  const label = String(item?.label || "").trim().toLowerCase();
  const fileName = href.split("#")[0].split("/").pop()?.toLowerCase() || "";
  return (
    /titlepage/i.test(fileName) ||
    /imprint/i.test(fileName) ||
    label === "titlepage" ||
    label === "title page" ||
    label === "imprint"
  );
}

function ContentsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M5 5.75h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 14.25h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FullscreenIcon({ active = false }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M7 4H4v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 4h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16H4v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 16h3v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {active ? (
        <>
          <path d="m8 8-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m12 8 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m8 12-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m12 12 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

function SpeakerIcon({ enabled = false }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M4.5 11.5h2.3l3.2 2.7v-8.4L6.8 8.5H4.5v3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {enabled ? (
        <>
          <path d="M13 7.5a3.7 3.7 0 0 1 0 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M14.75 5.9a6 6 0 0 1 0 8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </>
      ) : (
        <path d="m12.9 7.1 3.2 5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}

function HeadphonesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M4.75 10.5V9a5.25 5.25 0 1 1 10.5 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="3.5" y="10" width="2.75" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="13.75" y="10" width="2.75" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.25 16.25c.6.5 1.4.75 2.4.75h2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M10 3.5a6.5 6.5 0 1 0 6.5 6.5A4.4 4.4 0 0 1 10 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="6.2" cy="10" r="0.8" fill="currentColor" />
      <circle cx="8.6" cy="6.7" r="0.8" fill="currentColor" />
      <circle cx="10.9" cy="12.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <path d="M7 5.4c0-.78.86-1.25 1.52-.83l6 3.85a.99.99 0 0 1 0 1.66l-6 3.85A1 1 0 0 1 7 13.12V5.4Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <rect x="5.5" y="4.5" width="3.2" height="11" rx="1" />
      <rect x="11.3" y="4.5" width="3.2" height="11" rx="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="m5.5 5.5 9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m14.5 5.5-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function HandSelectIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M8.2 9.2V4.8a1.1 1.1 0 1 1 2.2 0v3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.4 8.1V4.2a1.05 1.05 0 1 1 2.1 0V8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 8.7V5.3a1 1 0 1 1 2 0v5.1c0 2.9-1.9 5.2-4.6 5.2-1.9 0-3.2-1-4-2.8l-1.1-2.5a1.15 1.15 0 0 1 2.05-.99l.95 1.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 9.4V6.2a1.05 1.05 0 1 1 2.1 0v3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <circle cx="4.5" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="15.5" cy="10" r="1.4" />
    </svg>
  );
}

function buttonBaseClass(active = false, compact = false) {
  return `inline-flex items-center justify-center gap-2 border font-semibold uppercase tracking-[0.18em] transition ${
    active
      ? "border-[#103474] bg-[#103474] text-white"
      : "border-[#c7d8ff] bg-white text-[#103474] hover:border-[#103474] hover:bg-[#eef4ff]"
  } ${compact ? "h-9 w-9 text-[10px]" : "h-10 w-10 text-[11px]"}`;
}

function ActionButton({ active = false, compact = false, className = "", ...props }) {
  return (
    <button
      type="button"
      data-reader-ignore-keys="true"
      {...props}
      className={`${buttonBaseClass(active, compact)} ${className}`.trim()}
      style={{ borderRadius: "12px", ...(props.style || {}) }}
    />
  );
}

export default function FlipbookControlsBar({
  toc = [],
  currentPageIndex = 0,
  visiblePageNumber = null,
  visiblePageTotal = 0,
  progressPercent = 0,
  theme = "paper-cream",
  onThemeChange,
  isMobile = false,
  soundEnabled = false,
  onToggleSound,
  fullscreenSupported = false,
  isFullscreen = false,
  chromeVisible = true,
  onToggleFullscreen,
  onGoToPage,
  ttsEnabled = false,
  tts = {},
  onTtsVoiceChange,
  onTtsPlay,
  onTtsPause,
  onTtsResume,
  onTtsClosePanel,
  onTtsToggleSelectionMode,
}) {
  const [openPanel, setOpenPanel] = useState("");
  const [isCompactToolbar, setIsCompactToolbar] = useState(false);
  const rootRef = useRef(null);
  const visibleToc = useMemo(
    () => (Array.isArray(toc) ? toc : []).filter((item) => !isSkippedTocItem(item)),
    [toc]
  );
  const currentTocItem = useMemo(
    () =>
      visibleToc
        .filter((item) => Number(item.pageIndex) <= Number(currentPageIndex))
        .at(-1) || null,
    [currentPageIndex, visibleToc]
  );
  const pageProgressLabel =
    visiblePageNumber != null && visiblePageTotal > 0
      ? `${visiblePageNumber}/${visiblePageTotal}`
      : visiblePageTotal > 0
      ? `Cover/${visiblePageTotal}`
      : "0/0";
  const ttsVoices = Array.isArray(tts?.voices) ? tts.voices : [];
  const ttsStatus = String(tts?.status || "idle");
  const ttsSelectionMode = Boolean(tts?.selectionMode);
  const canResumeTts = ttsStatus === "paused";
  const canPauseTts = ttsStatus === "playing";
  const showTtsControls = Boolean(tts?.showControls);

  useEffect(() => {
    if (!openPanel) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) return;
      setOpenPanel("");
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpenPanel("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openPanel]);

  useEffect(() => {
    const compactQuery = window.matchMedia("(max-width: 599px)");
    const syncCompactToolbar = () => setIsCompactToolbar(compactQuery.matches);
    syncCompactToolbar();
    compactQuery.addEventListener("change", syncCompactToolbar);
    return () => compactQuery.removeEventListener("change", syncCompactToolbar);
  }, []);

  const panelShellStyle = useMemo(
    () => ({
      background: "var(--flipbook-stage-header-bg)",
      borderColor: "var(--flipbook-stage-header-border)",
      color: "var(--flipbook-toolbar-text)",
      boxShadow: "none",
      backdropFilter: "none",
    }),
    []
  );

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none relative z-20 w-full transition duration-300 ${
        chromeVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      aria-hidden={!chromeVisible}
    >
      <div className="pointer-events-auto mx-auto w-full">
        {openPanel === "toc" ? (
          <div
            className={`mb-2 overflow-hidden rounded-[14px] border ${isMobile ? "max-h-[38vh] w-full" : "w-[24rem]"}`}
            style={panelShellStyle}
          >
            <div className={`${isMobile ? "px-3 py-2.5" : "px-4 py-3"} border-b border-[#d5e3ff]`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b79b0]">Contents</p>
              <p className={`mt-1 text-[#103474] ${isMobile ? "text-xs" : "text-sm"}`}>Jump to a chapter without leaving the book stage.</p>
            </div>
            <div className={`overflow-y-auto px-2 py-2 ${isMobile ? "max-h-[15rem]" : "max-h-[20rem]"}`}>
              {visibleToc.length ? (
                visibleToc.map((item) => {
                  const active = currentTocItem?.id === item.id;
                  return (
                    <button
                      key={`${item.id}-${item.pageIndex}`}
                      type="button"
                      onClick={() => {
                        onGoToPage?.(Number(item.pageIndex) || 0);
                        setOpenPanel("");
                      }}
                      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm transition ${
                        active ? "bg-[#103474] text-white" : "text-[#103474] hover:bg-[#eef4ff]"
                      }`}
                      style={{ paddingLeft: `${0.9 + Math.min(Number(item.depth) || 0, 4) * 0.85}rem`, borderRadius: "12px" }}
                    >
                      <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-current opacity-55" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-4 text-sm text-[#5b79b0]">This flipbook does not expose a table of contents.</p>
              )}
            </div>
          </div>
        ) : null}

        {openPanel === "themes" ? (
          <div
            className={`mb-2 overflow-hidden rounded-[14px] border ${isMobile ? "w-full" : "ml-auto w-[19rem]"}`}
            style={panelShellStyle}
          >
            <div className={`${isMobile ? "px-3 py-2.5" : "px-4 py-3"} border-b border-[#d5e3ff]`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b79b0]">Themes</p>
              <p className={`mt-1 text-[#103474] ${isMobile ? "text-xs" : "text-sm"}`}>Change paper tone and stage finish without changing pagination.</p>
            </div>
            <div className={`${isMobile ? "px-3 py-3" : "px-4 py-4"} grid grid-cols-2 gap-2`}>
              {FLIPBOOK_THEME_OPTIONS.map((option) => {
                const active = option.id === theme;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onThemeChange?.(option.id)}
                    className={`border px-3 py-2 text-xs font-semibold transition ${
                      active ? "border-[#103474] bg-[#103474] text-white" : "border-[#c7d8ff] bg-white text-[#103474] hover:bg-[#eef4ff]"
                    }`}
                      style={{ borderRadius: "12px" }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {openPanel === "more" && isCompactToolbar ? (
          <div
            className="mb-2 w-full overflow-hidden rounded-[14px] border"
            style={panelShellStyle}
          >
            <div className="border-b border-[#d5e3ff] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b79b0]">More</p>
              <p className="mt-1 text-xs text-[#103474]">Secondary reading controls for small screens.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 px-3 py-3">
              <button
                type="button"
                onClick={() => {
                  setOpenPanel("themes");
                }}
                className="inline-flex min-h-11 items-center justify-between gap-3 rounded-[12px] border border-[#c7d8ff] bg-white px-3 py-2 text-sm font-semibold text-[#103474] transition hover:bg-[#eef4ff]"
              >
                <span>Themes</span>
                <ThemeIcon />
              </button>
              <button
                type="button"
                onClick={onToggleSound}
                className="inline-flex min-h-11 items-center justify-between gap-3 rounded-[12px] border border-[#c7d8ff] bg-white px-3 py-2 text-sm font-semibold text-[#103474] transition hover:bg-[#eef4ff]"
              >
                <span>Page sound</span>
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-[#5b79b0]">{soundEnabled ? "On" : "Off"}</span>
                  <SpeakerIcon enabled={soundEnabled} />
                </span>
              </button>
              {fullscreenSupported ? (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="inline-flex min-h-11 items-center justify-between gap-3 rounded-[12px] border border-[#c7d8ff] bg-white px-3 py-2 text-sm font-semibold text-[#103474] transition hover:bg-[#eef4ff]"
                >
                  <span>Fullscreen</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-[#5b79b0]">{isFullscreen ? "On" : "Off"}</span>
                    <FullscreenIcon active={isFullscreen} />
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {openPanel === "tts" && ttsEnabled ? (
          <div
            className={`mb-2 overflow-hidden rounded-[14px] border ${isMobile ? "w-full" : "ml-auto w-[17rem]"}`}
            style={panelShellStyle}
          >
            <div className={`${isMobile ? "px-3 py-2.5" : "px-4 py-3"} border-b border-[#d5e3ff]`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b79b0]">Voice</p>
              <p className={`mt-1 text-[#103474] ${isMobile ? "text-xs" : "text-sm"}`}>Choose a voice for read aloud.</p>
            </div>
            <div className={`${isMobile ? "px-3 py-3" : "px-4 py-4"} space-y-2`}>
              <div className="grid grid-cols-1 gap-2">
                {ttsVoices.map((voice) => {
                  const active = voice.id === tts?.voiceId;
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => {
                        onTtsVoiceChange?.(voice.id);
                        setOpenPanel("");
                      }}
                      className={`border px-3 py-2 text-left text-xs font-semibold transition ${
                        active ? "border-[#103474] bg-[#103474] text-white" : "border-[#c7d8ff] bg-white text-[#103474] hover:bg-[#eef4ff]"
                      }`}
                      style={{ borderRadius: "12px" }}
                    >
                      {voice.displayLabel || voice.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {showTtsControls ? (
          <div className="mb-2 flex justify-center">
            <div
              className={`pointer-events-auto inline-flex items-center gap-2 border px-2 py-2 ${isMobile ? "max-w-full" : ""}`}
              style={{ ...panelShellStyle, borderRadius: "14px" }}
            >
              <button
                type="button"
                onClick={canResumeTts ? onTtsResume : canPauseTts ? onTtsPause : onTtsPlay}
                className="inline-flex h-9 w-9 items-center justify-center border border-[#c7d8ff] bg-white text-[#103474] transition hover:bg-[#eef4ff]"
                style={{ borderRadius: "12px" }}
                aria-label={canResumeTts ? "Resume read aloud" : canPauseTts ? "Pause read aloud" : "Play read aloud"}
              >
                {canResumeTts || !canPauseTts ? <PlayIcon /> : <PauseIcon />}
              </button>
              <button
                type="button"
                onClick={onTtsToggleSelectionMode}
                className={`inline-flex h-9 w-9 items-center justify-center border transition ${
                  ttsSelectionMode
                    ? "border-[#103474] bg-[#103474] text-white"
                    : "border-[#c7d8ff] bg-white text-[#103474] hover:bg-[#eef4ff]"
                }`}
                style={{ borderRadius: "12px" }}
                aria-label="Toggle paragraph tap mode"
                title={ttsSelectionMode ? "Paragraph tap mode enabled" : "Enable paragraph tap mode"}
              >
                <HandSelectIcon />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenPanel("");
                  onTtsClosePanel?.();
                }}
                className="inline-flex h-9 w-9 items-center justify-center border border-[#c7d8ff] bg-white text-[#103474] transition hover:bg-[#eef4ff]"
                style={{ borderRadius: "12px" }}
                aria-label="Close read aloud controls"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={`flex items-center gap-2 rounded-[14px] border px-2 py-2 ${isMobile ? "pl-2 pr-2" : "pl-2.5 pr-2.5"}`}
          style={{
            background: "transparent",
            borderColor: "transparent",
            color: "var(--flipbook-toolbar-text)",
            boxShadow: "none",
            backdropFilter: "none",
          }}
        >
          <div className="flex items-center gap-2">
            <ActionButton active={openPanel === "toc"} compact={isMobile} onClick={() => setOpenPanel((previous) => (previous === "toc" ? "" : "toc"))} aria-label="Open contents">
              <ContentsIcon />
            </ActionButton>
          </div>

          <div className="min-w-0 flex-1 px-1.5">
            <div className={`flex items-center justify-between gap-3 font-semibold uppercase tracking-[0.22em] text-[#5b79b0] ${isMobile ? "text-[9px]" : "text-[10px]"}`}>
              <span className="truncate">{visiblePageNumber == null ? "Cover" : isMobile ? "Reading" : "Book progress"}</span>
              <span>{pageProgressLabel}</span>
            </div>
            <div className={`overflow-hidden bg-[#cfe0ff] ${isMobile ? "mt-1 h-[5px]" : "mt-1.5 h-1.5"}`} style={{ borderRadius: "999px" }}>
              <div className="h-full bg-[#103474] transition-[width] duration-300 ease-out" style={{ width: `${Math.max(0, Math.min(100, Number(progressPercent) || 0))}%`, borderRadius: "999px" }} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCompactToolbar ? (
              <ActionButton active={openPanel === "themes"} compact={isMobile} onClick={() => setOpenPanel((previous) => (previous === "themes" ? "" : "themes"))} aria-label="Open themes">
                <ThemeIcon />
              </ActionButton>
            ) : null}

            {!isCompactToolbar ? (
              <ActionButton active={soundEnabled} compact={isMobile} onClick={onToggleSound} aria-label={soundEnabled ? "Disable page sound" : "Enable page sound"}>
                <SpeakerIcon enabled={soundEnabled} />
              </ActionButton>
            ) : null}

            {ttsEnabled ? (
              <ActionButton active={openPanel === "tts"} compact={isMobile} onClick={() => setOpenPanel((previous) => (previous === "tts" ? "" : "tts"))} aria-label="Open read aloud voices">
                <HeadphonesIcon />
              </ActionButton>
            ) : null}

            {!isCompactToolbar && fullscreenSupported ? (
              <ActionButton active={isFullscreen} compact={isMobile} onClick={onToggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                <FullscreenIcon active={isFullscreen} />
              </ActionButton>
            ) : null}

            {isCompactToolbar ? (
              <ActionButton active={openPanel === "more"} compact={isMobile} onClick={() => setOpenPanel((previous) => (previous === "more" ? "" : "more"))} aria-label="More reading options">
                <MoreIcon />
              </ActionButton>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
