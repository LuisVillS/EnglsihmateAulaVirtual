"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FlipAnimationAdapter from "@/components/flipbook/flip-animation-adapter";
import { buildFlipbookPageMarkup } from "@/components/flipbook/page-surface";
import {
  FLIPBOOK_CANONICAL_PAGE_HEIGHT,
  FLIPBOOK_CANONICAL_PAGE_WIDTH,
  FLIPBOOK_CANONICAL_SPREAD_WIDTH,
  FLIPBOOK_VISUAL_STATE_CLOSED_BOOK,
  FLIPBOOK_VISUAL_STATE_OPENING_BOOK,
  resolveFlipbookPresentationMode,
  resolveFlipbookStageScale,
} from "@/lib/flipbook-core/presentation";

const FLIPBOOK_ARROW_BUTTON_WIDTH = 44;
const FLIPBOOK_ARROW_BUTTON_HEIGHT = 108;
const FLIPBOOK_ARROW_EDGE_GAP = 50;

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M11.75 4.75 6.5 10l5.25 5.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M8.25 4.75 13.5 10l-5.25 5.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FlipbookBookFrame({
  pages = [],
  startPage = 0,
  windowStart = 0,
  ttsActivePageIndex = null,
  visualPageIndex = 0,
  adapterWindowKey = "0:-1",
  showCover = true,
  isFullscreen = false,
  showPageArrows = false,
  canGoPrev = false,
  canGoNext = false,
  coverPage = null,
  chromeVisible = true,
  ttsSelectionMode = false,
  navigationLocked = false,
  visualState = "READING",
  onReady,
  onPageSet,
  onFlipStateChange,
  onOpeningTransitionReady,
  onRequestOpenBook,
  onRequestPageTurn,
  onFlip,
  onOrientationChange,
  adapterRef,
}) {
  const viewportRef = useRef(null);
  const orientationBridgeRef = useRef(onOrientationChange);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [windowViewport, setWindowViewport] = useState({ width: 0, height: 0 });
  const frameRef = useRef(0);
  const layoutSyncFrameRef = useRef(0);
  const openingNotificationRef = useRef(false);

  const measureViewport = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setViewportSize((previous) => {
      const nextWidth = Math.max(0, rect.width);
      const nextHeight = Math.max(0, rect.height);
      if (previous.width === nextWidth && previous.height === nextHeight) {
        return previous;
      }
      return {
        width: nextWidth,
        height: nextHeight,
      };
    });
  }, []);

  useEffect(() => {
    orientationBridgeRef.current = onOrientationChange;
  }, [onOrientationChange]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const scheduleMeasure = () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        measureViewport();
      });
    };

    measureViewport();
    const observer = new ResizeObserver(() => scheduleMeasure());
    observer.observe(element);
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener?.("resize", scheduleMeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener?.("resize", scheduleMeasure);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [measureViewport]);

  useEffect(() => {
    const syncWindowViewport = () =>
      setWindowViewport({
        width: Math.max(0, window.innerWidth || 0),
        height: Math.max(0, window.innerHeight || 0),
      });
    syncWindowViewport();
    window.addEventListener("resize", syncWindowViewport);
    window.visualViewport?.addEventListener?.("resize", syncWindowViewport);
    return () => {
      window.removeEventListener("resize", syncWindowViewport);
      window.visualViewport?.removeEventListener?.("resize", syncWindowViewport);
    };
  }, []);

  const presentationMode = useMemo(
    () =>
      resolveFlipbookPresentationMode({
        viewportWidth: windowViewport.width,
      }),
    [windowViewport.width]
  );
  const isClosedBook = visualState === FLIPBOOK_VISUAL_STATE_CLOSED_BOOK;
  const isOpeningBook = visualState === FLIPBOOK_VISUAL_STATE_OPENING_BOOK;
  const isPortrait = presentationMode === "single";
  const readingWidth = isPortrait
    ? FLIPBOOK_CANONICAL_PAGE_WIDTH
    : FLIPBOOK_CANONICAL_SPREAD_WIDTH;
  const activeWidth = isClosedBook ? FLIPBOOK_CANONICAL_PAGE_WIDTH : readingWidth;
  const activeHeight = FLIPBOOK_CANONICAL_PAGE_HEIGHT;
  const sideReserve = showPageArrows ? FLIPBOOK_ARROW_EDGE_GAP + FLIPBOOK_ARROW_BUTTON_WIDTH : 0;
  const scale = useMemo(
    () =>
      resolveFlipbookStageScale({
        viewportWidth: Math.max(0, viewportSize.width - sideReserve * 2),
        viewportHeight: viewportSize.height,
        presentationMode: isClosedBook ? "single" : presentationMode,
        targetHeight:
          isFullscreen || !windowViewport.height
            ? viewportSize.height
            : Math.min(viewportSize.height, windowViewport.height * 0.85),
      }) || 1,
    [isClosedBook, isFullscreen, presentationMode, sideReserve, viewportSize.height, viewportSize.width, windowViewport.height]
  );

  const closedCoverMarkup = useMemo(() => {
    if (!coverPage) return "";
    const markup = buildFlipbookPageMarkup({
      page: {
        ...coverPage,
        runtimeMode: coverPage.flags?.isPlaceholder ? "placeholder" : "live",
      },
    });
    return markup.html;
  }, [coverPage]);

  useEffect(() => {
    orientationBridgeRef.current?.(isPortrait);
  }, [isPortrait]);

  useEffect(() => {
    if (!isOpeningBook) {
      openingNotificationRef.current = false;
      return undefined;
    }
    if (openingNotificationRef.current) return undefined;

    openingNotificationRef.current = true;
    const timeoutId = window.setTimeout(() => {
      onOpeningTransitionReady?.();
    }, isPortrait ? 40 : 120);
    return () => window.clearTimeout(timeoutId);
  }, [isOpeningBook, isPortrait, onOpeningTransitionReady]);

  const scheduleLayoutSync = useCallback(() => {
    if (layoutSyncFrameRef.current) {
      window.cancelAnimationFrame(layoutSyncFrameRef.current);
    }
    layoutSyncFrameRef.current = window.requestAnimationFrame(() => {
      layoutSyncFrameRef.current = 0;
      adapterRef?.current?.refreshLayout?.();
    });
  }, [adapterRef]);

  useEffect(() => {
    if (!viewportSize.width || !viewportSize.height) return undefined;
    scheduleLayoutSync();
    return () => {
      if (layoutSyncFrameRef.current) {
        window.cancelAnimationFrame(layoutSyncFrameRef.current);
        layoutSyncFrameRef.current = 0;
      }
    };
  }, [presentationMode, scale, scheduleLayoutSync, viewportSize.height, viewportSize.width]);

  const scaledWrapperStyle = useMemo(
    () => ({
      width: `${activeWidth * scale + sideReserve * 2}px`,
      height: `${activeHeight * scale}px`,
      position: "relative",
      flex: "0 0 auto",
      overflow: "hidden",
      transition: isOpeningBook ? "width 320ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
    }),
    [activeHeight, activeWidth, isOpeningBook, scale, sideReserve]
  );

  const bookShellStyle = useMemo(
    () => ({
      position: "absolute",
      left: `${sideReserve}px`,
      top: 0,
      width: `${readingWidth * scale}px`,
      height: `${activeHeight * scale}px`,
      opacity: isClosedBook ? 0 : 1,
      pointerEvents: navigationLocked ? "none" : "auto",
      transition: "opacity 200ms ease",
    }),
    [activeHeight, isClosedBook, navigationLocked, readingWidth, scale, sideReserve]
  );

  const innerShellStyle = useMemo(
    () => ({
      width: `${readingWidth}px`,
      height: `${activeHeight}px`,
      transform: `scale(${scale})`,
      transformOrigin: "top left",
    }),
    [activeHeight, readingWidth, scale]
  );

  const handleClosedBookOpen = useCallback(() => {
    if (!onRequestOpenBook) return;
    onRequestOpenBook();
  }, [onRequestOpenBook]);

  return (
    <div ref={viewportRef} className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden">
      <div style={scaledWrapperStyle}>
        {showPageArrows && !isClosedBook ? (
          <button
            type="button"
            onClick={() => onRequestPageTurn?.("previous")}
            disabled={!canGoPrev || ttsSelectionMode || navigationLocked}
            className={`flipbook-book-arrow left ${chromeVisible || !isFullscreen ? "opacity-100" : "opacity-0"}`}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </button>
        ) : null}
        <div style={bookShellStyle}>
          <div style={innerShellStyle}>
            <FlipAnimationAdapter
              key={`${adapterWindowKey}:${presentationMode}`}
              ref={adapterRef}
              pages={pages}
              windowKey={adapterWindowKey}
              windowStart={windowStart}
              startPage={startPage}
              visualPageIndex={visualPageIndex}
              ttsActivePageIndex={ttsActivePageIndex}
              showCover={showCover}
              presentationMode={presentationMode}
              isPortrait={isPortrait}
              onFlip={onFlip}
              onPageSet={onPageSet}
              onReady={onReady}
              onFlipStateChange={onFlipStateChange}
              onOrientationChange={(payload) => orientationBridgeRef.current?.(payload)}
            />
          </div>
        </div>
        {showPageArrows ? (
          <button
            type="button"
            onClick={() => (isClosedBook ? handleClosedBookOpen() : onRequestPageTurn?.("next"))}
            disabled={
              isClosedBook
                ? !onRequestOpenBook || navigationLocked
                : !canGoNext || ttsSelectionMode || navigationLocked
            }
            className={`flipbook-book-arrow right ${chromeVisible || !isFullscreen ? "opacity-100" : "opacity-0"}`}
            aria-label={isClosedBook ? "Open book" : "Next page"}
          >
            <ChevronRightIcon />
          </button>
        ) : null}
        {(isClosedBook || isOpeningBook) && closedCoverMarkup ? (
          <button
            type="button"
            onClick={handleClosedBookOpen}
            className={`flipbook-closed-book-shell ${isOpeningBook ? "opening" : ""}`}
            aria-label="Open book"
          >
            <div
              className="flipbook-closed-book-surface"
              dangerouslySetInnerHTML={{ __html: closedCoverMarkup }}
            />
            <span className="flipbook-closed-book-spine" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <style jsx>{`
        .flipbook-book-arrow {
          position: absolute;
          top: 50%;
          z-index: 15;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${FLIPBOOK_ARROW_BUTTON_WIDTH}px;
          height: ${FLIPBOOK_ARROW_BUTTON_HEIGHT}px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: rgba(10, 12, 16, 0.3);
          color: rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(16px);
          box-shadow: 0 14px 38px rgba(0, 0, 0, 0.26);
          transition: opacity 180ms ease, transform 180ms ease, background 180ms ease, border-color 180ms ease;
        }
        .flipbook-book-arrow.left {
          left: 0;
          transform: translateY(-50%);
        }
        .flipbook-book-arrow.right {
          right: 0;
          transform: translateY(-50%);
        }
        .flipbook-book-arrow:hover:not(:disabled) {
          transform: translateY(-50%) scale(1.02);
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.2);
          color: white;
        }
        .flipbook-book-arrow:disabled {
          cursor: not-allowed;
          opacity: 0.28;
        }
        .flipbook-closed-book-shell {
          position: absolute;
          inset: 0 auto 0 ${sideReserve}px;
          z-index: 18;
          display: flex;
          align-items: stretch;
          justify-content: center;
          width: ${FLIPBOOK_CANONICAL_PAGE_WIDTH * scale}px;
          height: ${FLIPBOOK_CANONICAL_PAGE_HEIGHT * scale}px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          transition: opacity 220ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
          transform-origin: center center;
        }
        .flipbook-closed-book-shell.opening {
          opacity: 0;
          transform: scale(0.992);
          pointer-events: none;
        }
        .flipbook-closed-book-surface {
          position: relative;
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 28px 42px rgba(0, 0, 0, 0.34));
        }
        .flipbook-closed-book-surface :global(.flipbook-runtime-page) {
          box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
        }
        .flipbook-closed-book-spine {
          position: absolute;
          left: 0;
          top: 2%;
          bottom: 2%;
          width: 14px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(28, 22, 14, 0.6), rgba(11, 9, 7, 0.22));
          box-shadow: inset -2px 0 4px rgba(255, 255, 255, 0.08), inset 2px 0 5px rgba(0, 0, 0, 0.2);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
