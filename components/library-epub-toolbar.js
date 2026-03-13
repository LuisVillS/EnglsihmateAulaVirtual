"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LIBRARY_EPUB_THEME_OPTIONS,
  resolveLibraryEpubTheme,
} from "@/lib/library/epub-reader-ui";

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
      {active ? (
        <>
          <path d="M7 4H4v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 4h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 16H4v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 16h3v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m8 8-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m12 8 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m8 12-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m12 12 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M7 4H4v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 4h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 16H4v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 16h3v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
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

function MouseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <rect x="6" y="2.75" width="8" height="14.5" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 2.75v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function DotsIcon() {
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
      ? "border-white/20 bg-white/10 text-white"
      : "border-white/10 bg-white/[0.04] text-white/72 hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
  } ${compact ? "h-9 px-2.5 text-[10px]" : "h-10 px-3 text-[11px]"}`;
}

function ActionButton({ active = false, compact = false, className = "", ...props }) {
  return (
    <button
      type="button"
      data-reader-ignore-keys="true"
      {...props}
      className={`${buttonBaseClass(active, compact)} ${className}`.trim()}
      style={{ borderRadius: "14px", ...(props.style || {}) }}
    />
  );
}

export default function LibraryEpubToolbar({
  readerState = {},
  theme = "sepia",
  soundEnabled = false,
  isMobile = false,
  fullscreenSupported = false,
  isFullscreen = false,
  chromeVisible = true,
  onGoToHref,
  onThemeChange,
  onToggleSound,
  onToggleFullscreen,
  ttsEnabled = false,
  tts = {},
  onTtsVoiceChange,
  onTtsPlay,
  onTtsPause,
  onTtsResume,
  onTtsStop,
  onTtsToggleSelectionMode,
}) {
  const [openPanel, setOpenPanel] = useState("");
  const rootRef = useRef(null);
  const tocItems = Array.isArray(readerState?.toc) ? readerState.toc : [];
  const currentHref = readerState?.currentHref || "";
  const currentTheme = resolveLibraryEpubTheme(theme);
  const firstVisiblePageNumber =
    readerState?.visiblePageNumbers?.left ?? readerState?.pageNumber ?? null;
  const totalPageCount =
    readerState?.pageTotal == null || readerState.pageTotal === ""
      ? null
      : Math.max(0, Number(readerState.pageTotal) || 0);
  const progressPercent =
    firstVisiblePageNumber && totalPageCount
      ? Math.max(0, Math.min(100, (Number(firstVisiblePageNumber) / Number(totalPageCount)) * 100))
      : readerState?.progressPercent == null || readerState.progressPercent === ""
        ? 0
        : Math.max(0, Math.min(100, Number(readerState.progressPercent) || 0));
  const pageProgressLabel =
    firstVisiblePageNumber && totalPageCount
      ? `${Number(firstVisiblePageNumber)}/${Number(totalPageCount)}`
      : firstVisiblePageNumber
        ? `${Number(firstVisiblePageNumber)}`
        : "0/0";
  const panelShellStyle = useMemo(
    () => ({
      background: "rgba(13, 15, 18, 0.96)",
      borderColor: "rgba(255, 255, 255, 0.1)",
      color: currentTheme.controlText,
      borderRadius: "18px",
      boxShadow: "0 22px 60px rgba(0, 0, 0, 0.42)",
      backdropFilter: "blur(18px)",
    }),
    [currentTheme.controlText]
  );
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

  const barStyle = {
    background: currentTheme.controlBackground,
    borderColor: currentTheme.controlBorder,
    color: currentTheme.controlText,
    boxShadow: "0 16px 44px rgba(0, 0, 0, 0.32)",
    borderRadius: isMobile ? "18px" : "20px",
  };

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute inset-x-2 bottom-0 z-20 transition duration-300 sm:inset-x-4 sm:bottom-0 ${
        chromeVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      aria-hidden={!chromeVisible}
    >
      <div className={`pointer-events-auto mx-auto w-full ${isMobile ? "max-w-[92vw]" : "max-w-[760px]"}`} data-reader-ignore-keys="true">
        {openPanel === "toc" ? (
          <div
            className={`mb-2 overflow-hidden border ${isMobile ? "max-h-[38vh] w-full" : "ml-0 max-h-[24rem] w-[21rem]"}`}
            style={panelShellStyle}
          >
            <div className={`border-b border-white/10 ${isMobile ? "px-3 py-2.5" : "px-4 py-3"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Contents</p>
              <p className={`mt-1 text-white/78 ${isMobile ? "text-xs" : "text-sm"}`}>Jump to a chapter without leaving the reading stage.</p>
            </div>
            <div className={`overflow-y-auto px-2 py-2 ${isMobile ? "max-h-[15rem]" : "max-h-[20rem]"}`}>
              {tocItems.length ? (
                tocItems.map((item) => {
                  const active = item.href === currentHref;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      data-reader-ignore-keys="true"
                      onClick={() => {
                        onGoToHref?.(item.href);
                        setOpenPanel("");
                      }}
                      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm transition ${
                        active ? "bg-white/10 text-white" : "text-white/72 hover:bg-white/6 hover:text-white"
                      }`}
                      style={{
                        paddingLeft: `${0.9 + Math.min(item.depth, 4) * 0.85}rem`,
                        borderRadius: "12px",
                      }}
                    >
                      <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-current opacity-55" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-4 text-sm text-white/65">This EPUB does not expose a table of contents.</p>
              )}
            </div>
          </div>
        ) : null}

        {openPanel === "settings" ? (
          <div
            className={`mb-2 overflow-hidden border ${isMobile ? "w-full" : "ml-auto w-[19rem]"}`}
            style={panelShellStyle}
          >
            <div className={`border-b border-white/10 ${isMobile ? "px-3 py-2.5" : "px-4 py-3"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Reader Settings</p>
              <p className={`mt-1 text-white/78 ${isMobile ? "text-xs" : "text-sm"}`}>Keep the book clean and adjust only what you need.</p>
            </div>
            <div className={`space-y-4 ${isMobile ? "px-3 py-3" : "px-4 py-4"}`}>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">Theme</p>
                <div className="grid grid-cols-3 gap-2">
                  {LIBRARY_EPUB_THEME_OPTIONS.map((option) => {
                    const active = option.value === theme;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-reader-ignore-keys="true"
                        onClick={() => onThemeChange?.(option.value)}
                        className={`border px-3 py-2 text-xs font-semibold transition ${
                          active ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/5 text-white/72 hover:bg-white/9 hover:text-white"
                        }`}
                        style={{ borderRadius: "12px" }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  data-reader-ignore-keys="true"
                  onClick={onToggleSound}
                  className="inline-flex min-h-11 items-center justify-between gap-3 border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/10"
                  style={{ borderRadius: "12px" }}
                >
                  <span>Page sound</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-white/55">{soundEnabled ? "On" : "Off"}</span>
                </button>
                {fullscreenSupported ? (
                  <button
                    type="button"
                    data-reader-ignore-keys="true"
                    onClick={onToggleFullscreen}
                    className="inline-flex min-h-11 items-center justify-between gap-3 border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/10"
                    style={{ borderRadius: "12px" }}
                  >
                    <span>Fullscreen</span>
                    <span className="text-xs uppercase tracking-[0.18em] text-white/55">{isFullscreen ? "On" : "Off"}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {openPanel === "tts" && ttsEnabled ? (
          <div
            className={`mb-2 overflow-hidden border ${isMobile ? "w-full" : "ml-auto w-[17rem]"}`}
            style={panelShellStyle}
          >
            <div className={`border-b border-white/10 ${isMobile ? "px-3 py-2.5" : "px-4 py-3"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Voice</p>
              <p className={`mt-1 text-white/78 ${isMobile ? "text-xs" : "text-sm"}`}>
                Choose a voice for read aloud.
              </p>
            </div>
            <div className={`space-y-2 ${isMobile ? "px-3 py-3" : "px-4 py-4"}`}>
              <div className="grid grid-cols-3 gap-2">
                {ttsVoices.map((voice) => {
                  const active = voice.id === tts?.voiceId;
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      data-reader-ignore-keys="true"
                      onClick={() => {
                        onTtsVoiceChange?.(voice.id);
                        setOpenPanel("");
                      }}
                      className={`border px-3 py-2 text-xs font-semibold transition ${
                        active ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/5 text-white/72 hover:bg-white/9 hover:text-white"
                      }`}
                      style={{ borderRadius: "12px" }}
                    >
                      {voice.label}
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
              className={`pointer-events-auto inline-flex items-center gap-2 border px-2 py-2 ${isMobile ? "max-w-[92vw]" : ""}`}
              style={{
                ...panelShellStyle,
                borderRadius: "16px",
              }}
            >
              <button
                type="button"
                data-reader-ignore-keys="true"
                onClick={canResumeTts ? onTtsResume : canPauseTts ? onTtsPause : onTtsPlay}
                className="inline-flex h-9 w-9 items-center justify-center border border-white/10 bg-white/5 text-white/82 transition hover:bg-white/10"
                style={{ borderRadius: "12px" }}
                aria-label={canResumeTts ? "Resume read aloud" : canPauseTts ? "Pause read aloud" : "Play read aloud"}
              >
                {canResumeTts || !canPauseTts ? <PlayIcon /> : <PauseIcon />}
              </button>
              <button
                type="button"
                data-reader-ignore-keys="true"
                onClick={onTtsToggleSelectionMode}
                className={`inline-flex h-9 w-9 items-center justify-center border transition ${
                  ttsSelectionMode
                    ? "border-white/18 bg-white/12 text-white"
                    : "border-white/10 bg-white/5 text-white/82 hover:bg-white/10"
                }`}
                style={{ borderRadius: "12px" }}
                aria-label="Pick paragraph to read aloud"
              >
                <MouseIcon />
              </button>
              <button
                type="button"
                data-reader-ignore-keys="true"
                onClick={onTtsStop}
                className="inline-flex h-9 w-9 items-center justify-center border border-white/10 bg-white/5 text-white/82 transition hover:bg-white/10"
                style={{ borderRadius: "12px" }}
                aria-label="Stop read aloud"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={`flex flex-col gap-2 border ${isMobile ? "px-2 py-1.5" : "px-2 py-2 sm:px-3"}`}
          style={barStyle}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <ActionButton
              active={openPanel === "toc"}
              compact={isMobile}
              onClick={() => setOpenPanel((previous) => (previous === "toc" ? "" : "toc"))}
              aria-label="Open contents"
              className={`${isMobile ? "w-9" : "w-10"} px-0`}
            >
              <ContentsIcon />
            </ActionButton>

            <div className="min-w-0 flex-1 px-0.5">
              <div className={`flex items-center justify-between gap-3 font-semibold uppercase tracking-[0.22em] text-white/55 ${isMobile ? "text-[9px]" : "text-[10px]"}`}>
                <span className="truncate">{isMobile ? "Reading" : "Book progress"}</span>
                <span>{pageProgressLabel}</span>
              </div>
              <div className={`overflow-hidden bg-white/10 ${isMobile ? "mt-1 h-[5px]" : "mt-1.5 h-1.5"}`} style={{ borderRadius: "999px" }}>
                <div
                  className="h-full bg-white/85 transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPercent}%`, borderRadius: "999px" }}
                />
              </div>
            </div>

            {!isMobile && ttsEnabled ? (
              <ActionButton
                active={openPanel === "tts"}
                onClick={() => setOpenPanel((previous) => (previous === "tts" ? "" : "tts"))}
                aria-label="Open read aloud voices"
                className="w-10 px-0"
              >
                <HeadphonesIcon />
              </ActionButton>
            ) : null}

            {!isMobile ? (
              <ActionButton
                active={soundEnabled}
                onClick={onToggleSound}
                aria-label={soundEnabled ? "Disable page sound" : "Enable page sound"}
                className="w-10 px-0"
              >
                <SpeakerIcon enabled={soundEnabled} />
              </ActionButton>
            ) : null}

            {fullscreenSupported && !isMobile ? (
              <ActionButton
                active={isFullscreen}
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="w-10 px-0"
              >
                <FullscreenIcon active={isFullscreen} />
              </ActionButton>
            ) : null}

            <ActionButton
              active={openPanel === "settings"}
              compact={isMobile}
              onClick={() => setOpenPanel((previous) => (previous === "settings" ? "" : "settings"))}
              aria-label="Open reader settings"
              className={`${isMobile ? "w-9" : "w-10"} px-0`}
            >
              <DotsIcon />
            </ActionButton>
          </div>
          {isMobile && ttsEnabled ? (
            <div className="flex justify-end">
              <ActionButton
                active={openPanel === "tts"}
                compact
                onClick={() => setOpenPanel((previous) => (previous === "tts" ? "" : "tts"))}
                aria-label="Open read aloud voices"
                className="w-9 px-0"
              >
                <HeadphonesIcon />
              </ActionButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
