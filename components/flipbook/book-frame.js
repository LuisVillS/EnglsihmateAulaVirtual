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

const FLIPBOOK_ARROW_BUTTON_WIDTH = 58;
const FLIPBOOK_ARROW_BUTTON_HEIGHT = 152;
const FLIPBOOK_ARROW_EDGE_GAP = 8;

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-10 w-10">
      <path d="M11.75 4.75 6.5 10l5.25 5.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-10 w-10">
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
  globalVisualPageIndex = 0,
  totalPageCount = 0,
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
  const dragGestureRef = useRef(null);

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
  const effectiveTotalPageCount = Math.max(1, Number(totalPageCount) || pages.length || 1);
  const readingProgress = Math.min(
    1,
    Math.max(0, Number(globalVisualPageIndex) || 0) / Math.max(1, effectiveTotalPageCount - 1)
  );
  const pagesReadRamp = Math.min(1, Math.max(0, Number(globalVisualPageIndex) || 0) / 64);
  const pagesRemainingRamp = Math.min(
    1,
    Math.max(0, effectiveTotalPageCount - 1 - (Number(globalVisualPageIndex) || 0)) / 64
  );
  const leftStackWeight = Math.max(readingProgress, pagesReadRamp);
  const rightStackWeight = Math.max(1 - readingProgress, pagesRemainingRamp);
  const leftStackDepth = isPortrait ? 0 : 10 + Math.round(leftStackWeight * 20);
  const rightStackDepth = isPortrait ? 0 : 10 + Math.round(rightStackWeight * 20);
  const leftStackWidth = isPortrait ? 0 : 10 + leftStackWeight * 30;
  const rightStackWidth = isPortrait ? 0 : 12 + rightStackWeight * 30;
  const leftStackOpacity = isPortrait ? 0 : 0.18 + leftStackWeight * 0.34;
  const rightStackOpacity = isPortrait ? 0 : 0.18 + rightStackWeight * 0.34;
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
        targetHeight: viewportSize.height,
      }) || 1,
    [isClosedBook, presentationMode, sideReserve, viewportSize.height, viewportSize.width]
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
    function handlePointerMove(event) {
      const gesture = dragGestureRef.current;
      if (!gesture || gesture.handled) return;
      const deltaX = Number(event.clientX) - gesture.startX;
      const deltaY = Number(event.clientY) - gesture.startY;
      if (Math.abs(deltaX) < 42 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
        return;
      }

      if (gesture.side === "right" && deltaX < 0) {
        gesture.handled = true;
        onRequestPageTurn?.("next");
      } else if (gesture.side === "left" && deltaX > 0) {
        gesture.handled = true;
        onRequestPageTurn?.("previous");
      }
    }

    function clearGesture() {
      dragGestureRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", clearGesture);
    window.addEventListener("pointercancel", clearGesture);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", clearGesture);
      window.removeEventListener("pointercancel", clearGesture);
    };
  }, [onRequestPageTurn]);

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
      overflow: "visible",
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

  const readingFrameStyle = useMemo(
    () => ({
      position: "absolute",
      left: `${sideReserve}px`,
      top: 0,
      width: `${readingWidth * scale}px`,
      height: `${activeHeight * scale}px`,
      opacity: isClosedBook ? 0 : 1,
      pointerEvents: "none",
      transition: "opacity 220ms ease",
      filter: "drop-shadow(0 30px 54px rgba(0, 0, 0, 0.48))",
    }),
    [activeHeight, isClosedBook, readingWidth, scale, sideReserve]
  );

  const leftStackStyle = useMemo(
    () => ({
      "--flipbook-stack-depth": String(leftStackDepth),
      "--flipbook-stack-width": `${leftStackWidth}px`,
      "--flipbook-stack-opacity": leftStackOpacity,
    }),
    [leftStackDepth, leftStackOpacity, leftStackWidth]
  );

  const rightStackStyle = useMemo(
    () => ({
      "--flipbook-stack-depth": String(rightStackDepth),
      "--flipbook-stack-width": `${rightStackWidth}px`,
      "--flipbook-stack-opacity": rightStackOpacity,
    }),
    [rightStackDepth, rightStackOpacity, rightStackWidth]
  );

  const leftStackShellStyle = useMemo(
    () => ({
      position: "absolute",
      top: 0,
      left: `${Math.max(0, sideReserve - leftStackWidth * 0.74)}px`,
      width: `${leftStackWidth}px`,
      height: `${activeHeight * scale}px`,
      opacity: isClosedBook || isPortrait ? 0 : 1,
      pointerEvents: "none",
      zIndex: 5,
      transition: "opacity 220ms ease",
    }),
    [activeHeight, isClosedBook, isPortrait, leftStackWidth, scale, sideReserve]
  );

  const rightStackShellStyle = useMemo(
    () => ({
      position: "absolute",
      top: 0,
      left: `${sideReserve + readingWidth * scale - rightStackWidth * 0.26}px`,
      width: `${rightStackWidth}px`,
      height: `${activeHeight * scale}px`,
      opacity: isClosedBook || isPortrait ? 0 : 1,
      pointerEvents: "none",
      zIndex: 5,
      transition: "opacity 220ms ease",
    }),
    [activeHeight, isClosedBook, isPortrait, readingWidth, rightStackWidth, scale, sideReserve]
  );
  const showLeftPageStack = !isPortrait && Number(globalVisualPageIndex) > 0;

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

  const startGestureCapture = useCallback(
    (side) => (event) => {
      if (navigationLocked || isClosedBook) return;
      dragGestureRef.current = {
        side,
        startX: Number(event.clientX) || 0,
        startY: Number(event.clientY) || 0,
        handled: false,
      };
    },
    [isClosedBook, navigationLocked]
  );

  return (
    <div ref={viewportRef} className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden">
      <div style={scaledWrapperStyle}>
        {showPageArrows && !isClosedBook ? (
          <button
            type="button"
            onClick={() => onRequestPageTurn?.("previous")}
            disabled={!canGoPrev || navigationLocked}
            className={`flipbook-book-arrow left ${chromeVisible || !isFullscreen ? "opacity-100" : "opacity-0"}`}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </button>
        ) : null}
        {showLeftPageStack ? (
          <span className="flipbook-reading-frame-stack left" style={{ ...leftStackStyle, ...leftStackShellStyle }} aria-hidden="true" />
        ) : null}
        {!isPortrait ? (
          <span className="flipbook-reading-frame-stack right" style={{ ...rightStackStyle, ...rightStackShellStyle }} aria-hidden="true" />
        ) : null}
        <div style={readingFrameStyle} aria-hidden="true">
          <div className={`flipbook-reading-frame ${isPortrait ? "single" : "spread"}`}>
            <span className="flipbook-reading-frame-depth left" />
            <span className="flipbook-reading-frame-depth right" />
            {!isPortrait ? <span className="flipbook-reading-frame-gutter" /> : null}
          </div>
        </div>
        <div style={bookShellStyle}>
          {!ttsSelectionMode && !navigationLocked && !isClosedBook ? (
            <>
              <button
                type="button"
                className={`flipbook-drag-gesture-zone left ${isPortrait ? "single" : "spread"}`}
                aria-hidden="true"
                tabIndex={-1}
                onPointerDown={startGestureCapture("left")}
              />
              <button
                type="button"
                className={`flipbook-drag-gesture-zone right ${isPortrait ? "single" : "spread"}`}
                aria-hidden="true"
                tabIndex={-1}
                onPointerDown={startGestureCapture("right")}
              />
            </>
          ) : null}
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
                : !canGoNext || navigationLocked
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
          border: 0;
          border-radius: 0;
          background: transparent;
          color: rgba(255, 255, 255, 0.82);
          transition: opacity 180ms ease, transform 180ms ease, color 180ms ease;
          isolation: isolate;
        }
        .flipbook-book-arrow.left {
          left: -2px;
          transform: translateY(-50%);
        }
        .flipbook-book-arrow.right {
          right: -2px;
          transform: translateY(-50%);
        }
        .flipbook-book-arrow::before {
          content: "";
          position: absolute;
          inset: 18px 12px;
          border-radius: 999px;
          opacity: 0.18;
          transition: opacity 180ms ease, transform 180ms ease, filter 180ms ease;
        }
        .flipbook-book-arrow.left::before {
          background:
            radial-gradient(circle at 24% 50%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 22%, rgba(255,255,255,0) 62%),
            linear-gradient(90deg, rgba(0,0,0,0.26) 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0) 100%);
          box-shadow: -4px 0 14px rgba(0, 0, 0, 0.16);
        }
        .flipbook-book-arrow.right::before {
          background:
            radial-gradient(circle at 76% 50%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 22%, rgba(255,255,255,0) 62%),
            linear-gradient(270deg, rgba(0,0,0,0.26) 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0) 100%);
          box-shadow: 4px 0 14px rgba(0, 0, 0, 0.16);
        }
        .flipbook-book-arrow::after {
          display: none;
        }
        .flipbook-book-arrow :global(svg) {
          position: relative;
          z-index: 1;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.24));
        }
        .flipbook-book-arrow:hover:not(:disabled) {
          transform: translateY(-50%) scale(1.03);
          color: white;
        }
        .flipbook-book-arrow:hover:not(:disabled)::before {
          opacity: 0.34;
          filter: brightness(1.04);
        }
        .flipbook-book-arrow:disabled {
          cursor: not-allowed;
          opacity: 0.22;
        }
        .flipbook-reading-frame {
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
          border-radius: 6px;
          overflow: visible;
          background: transparent;
          box-shadow:
            0 26px 52px rgba(0, 0, 0, 0.18);
        }
        .flipbook-reading-frame-stack {
          position: absolute;
          top: -1px;
          bottom: -1px;
          width: var(--flipbook-stack-width, 16px);
          opacity: var(--flipbook-stack-opacity, 0.45);
          pointer-events: none;
          z-index: 5;
          border-radius: 0;
          overflow: visible;
          filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.1));
          backface-visibility: hidden;
        }
        .flipbook-reading-frame-stack::before,
        .flipbook-reading-frame-stack::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .flipbook-reading-frame-stack.left {
          clip-path: polygon(100% 0, 24% 0, 8% 100%, 100% 100%);
          transform: perspective(1400px) rotateY(-24deg) skewY(-0.4deg) translateZ(0);
          transform-origin: right center;
        }
        .flipbook-reading-frame-stack.left::before {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.8), rgba(240,236,228,0.92) 38%, rgba(226,221,213,0.94) 100%),
            repeating-linear-gradient(
              90deg,
              rgba(247,244,238,0.88) 0,
              rgba(247,244,238,0.88) 1px,
              rgba(230,226,219,0.88) 1px,
              rgba(230,226,219,0.88) 2px,
              rgba(207,202,194,0.22) 2px,
              rgba(207,202,194,0.08) calc(100% / var(--flipbook-stack-depth))
            );
          box-shadow:
            inset -1px 0 0 rgba(255,255,255,0.72),
            5px 0 10px rgba(0,0,0,0.08);
        }
        .flipbook-reading-frame-stack.left::after {
          background:
            linear-gradient(90deg, rgba(90,72,46,0.16) 0%, rgba(90,72,46,0.08) 24%, rgba(255,255,255,0.08) 58%, rgba(255,255,255,0.22) 100%),
            linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0));
        }
        .flipbook-reading-frame-stack.right {
          clip-path: polygon(0 0, 76% 0, 100% 100%, 0 100%);
          transform: perspective(1400px) rotateY(24deg) skewY(0.4deg) translateZ(0);
          transform-origin: left center;
        }
        .flipbook-reading-frame-stack.right::before {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.84), rgba(241,237,230,0.92) 38%, rgba(228,223,215,0.94) 100%),
            repeating-linear-gradient(
              90deg,
              rgba(248,245,239,0.88) 0,
              rgba(248,245,239,0.88) 1px,
              rgba(232,228,221,0.88) 1px,
              rgba(232,228,221,0.88) 2px,
              rgba(208,203,196,0.22) 2px,
              rgba(208,203,196,0.08) calc(100% / var(--flipbook-stack-depth))
            );
          box-shadow:
            inset 1px 0 0 rgba(255,255,255,0.72),
            -5px 0 10px rgba(0,0,0,0.08);
        }
        .flipbook-reading-frame-stack.right::after {
          background:
            linear-gradient(90deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 42%, rgba(90,72,46,0.08) 76%, rgba(90,72,46,0.16) 100%),
            linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0));
        }
        .flipbook-reading-frame::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at 50% 54%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.03) 18%, rgba(0,0,0,0) 42%),
            linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0) 18%, rgba(255,255,255,0) 82%, rgba(0,0,0,0.025));
          pointer-events: none;
        }
        .flipbook-reading-frame::after {
          content: "";
          position: absolute;
          top: 2.2%;
          bottom: 2.2%;
          right: -5px;
          width: 10px;
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)),
            linear-gradient(270deg, rgba(0,0,0,0.12), rgba(0,0,0,0));
          box-shadow: -2px 0 6px rgba(0, 0, 0, 0.08);
          opacity: 0.34;
          pointer-events: none;
        }
        .flipbook-reading-frame-depth {
          position: absolute;
          top: 1%;
          bottom: 1%;
          width: 6px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
          box-shadow: 0 0 4px rgba(0, 0, 0, 0.04);
          opacity: 0.14;
        }
        .flipbook-reading-frame-depth.left {
          left: 0;
          transform: translateX(-42%);
        }
        .flipbook-reading-frame-depth.right {
          right: 0;
          transform: translateX(42%);
        }
        .flipbook-reading-frame-gutter {
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 76px;
          transform: translateX(-50%);
          background:
            linear-gradient(
              90deg,
              rgba(0,0,0,0) 0%,
              rgba(61,46,27,0.12) 10%,
              rgba(61,46,27,0.22) 22%,
              rgba(255,255,255,0.08) 36%,
              rgba(255,255,255,0.14) 46%,
              rgba(48,35,20,0.28) 50%,
              rgba(255,255,255,0.14) 54%,
              rgba(255,255,255,0.08) 64%,
              rgba(61,46,27,0.22) 78%,
              rgba(61,46,27,0.12) 90%,
              rgba(0,0,0,0) 100%
            ),
            radial-gradient(ellipse at center, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0) 100%);
          box-shadow:
            inset 16px 0 20px rgba(61,46,27,0.08),
            inset -16px 0 20px rgba(61,46,27,0.1);
          opacity: 1;
        }
        .flipbook-reading-frame-gutter::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 2px;
          transform: translateX(-50%);
          background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02), rgba(255,255,255,0.12));
          opacity: 0.65;
        }
        .flipbook-reading-frame-gutter::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 54px;
          transform: translateX(-50%);
          background:
            radial-gradient(ellipse at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.08) 44%, rgba(0,0,0,0) 100%),
            linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.05));
          opacity: 0.9;
        }
        .flipbook-drag-gesture-zone {
          position: absolute;
          top: 0;
          bottom: 0;
          z-index: 9;
          border: 0;
          background: transparent;
          cursor: grab;
        }
        .flipbook-drag-gesture-zone.left.spread {
          left: 12%;
          width: 32%;
        }
        .flipbook-drag-gesture-zone.right.spread {
          right: 12%;
          width: 32%;
        }
        .flipbook-drag-gesture-zone.left.single,
        .flipbook-drag-gesture-zone.right.single {
          display: none;
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
          transform-origin: left center;
          transform-style: preserve-3d;
          transform: perspective(1400px) rotateY(-4deg);
        }
        .flipbook-closed-book-shell.opening {
          opacity: 0;
          transform: perspective(1400px) rotateY(-4deg) scale(0.992);
          pointer-events: none;
        }
        .flipbook-closed-book-shell::after {
          content: "";
          position: absolute;
          top: -1px;
          bottom: -1px;
          right: -18px;
          width: 18px;
          background:
            repeating-linear-gradient(
              180deg,
              rgba(240,238,232,0.92) 0,
              rgba(240,238,232,0.92) 1px,
              rgba(220,217,210,0.96) 1px,
              rgba(220,217,210,0.96) 2px,
              rgba(164,160,152,0.18) 2px,
              rgba(164,160,152,0.08) 4px
            );
          clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
          box-shadow:
            inset 2px 0 0 rgba(255,255,255,0.54),
            -10px 0 16px rgba(0,0,0,0.16);
          pointer-events: none;
          opacity: 0.94;
        }
        .flipbook-closed-book-surface {
          position: relative;
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 28px 42px rgba(0, 0, 0, 0.34));
        }
        .flipbook-closed-book-surface :global(.flipbook-runtime-page) {
          box-shadow:
            0 18px 36px rgba(0, 0, 0, 0.28),
            inset -18px 0 24px rgba(0, 0, 0, 0.16);
        }
        @media (max-width: 767px) {
          .flipbook-book-arrow {
            width: 46px;
            height: 116px;
          }
          .flipbook-book-arrow.left {
            left: -4px;
          }
          .flipbook-book-arrow.right {
            right: -4px;
          }
          .flipbook-book-arrow :global(svg) {
            width: 30px;
            height: 30px;
          }
        }
      `}</style>
    </div>
  );
}
