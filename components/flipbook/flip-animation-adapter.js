"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { buildFlipbookPageMarkup } from "@/components/flipbook/page-surface";
import {
  FLIPBOOK_CANONICAL_PAGE_HEIGHT,
  FLIPBOOK_CANONICAL_PAGE_WIDTH,
  FLIPBOOK_CANONICAL_SPREAD_WIDTH,
  resolveResumePageIndex,
} from "@/lib/flipbook-core/presentation";

function buildPageNodes(pages = []) {
  return pages.map((page) => {
    const node = document.createElement("div");
    const markup = buildFlipbookPageMarkup({ page });
    node.innerHTML = markup.html;
    node.dataset.density = markup.density;
    node.dataset.pageIndex = String(page.pageIndex);
    node.className = "flipbook-page-node";
    return node;
  });
}

function hashSignatureText(value = "") {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function buildPagesSignature(pages = []) {
  return (Array.isArray(pages) ? pages : [])
    .map((page) =>
      [
        page?.pageIndex ?? "",
        page?.pageId || "",
        page?.flags?.isPlaceholder ? "placeholder" : "ready",
        hashSignatureText(page?.html || ""),
        page?.chrome?.headerLeft || "",
        page?.chrome?.headerRight || "",
        page?.chrome?.footerLeft || "",
        page?.chrome?.footerRight || "",
      ].join(":")
    )
    .join("|");
}

function debugAdapterEvent(label, payload = {}) {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  console.info("[flipbook-adapter-debug]", label, payload);
}

const FlipAnimationAdapter = forwardRef(function FlipAnimationAdapter(
  {
    pages = [],
    windowKey = "",
    windowStart = 0,
    startPage = 0,
    visualPageIndex = 0,
    ttsActivePageIndex = null,
    showCover = true,
    presentationMode = "spread",
    isPortrait = false,
    onFlip,
    onPageSet,
    onReady,
    onFlipStateChange,
    onOrientationChange,
  },
  ref
) {
  const hostRef = useRef(null);
  const pageFlipRef = useRef(null);
  const stablePageIndexRef = useRef(Math.max(0, Number(startPage) || 0));
  const startPageRef = useRef(Math.max(0, Number(startPage) || 0));
  const visualPageIndexRef = useRef(visualPageIndex);
  const stablePresentationModeRef = useRef(presentationMode);
  const ttsActivePageIndexRef = useRef(ttsActivePageIndex);
  const onFlipRef = useRef(onFlip);
  const onPageSetRef = useRef(onPageSet);
  const onReadyRef = useRef(onReady);
  const onFlipStateChangeRef = useRef(onFlipStateChange);
  const onOrientationChangeRef = useRef(onOrientationChange);
  const windowKeyRef = useRef(windowKey);
  const windowStartRef = useRef(windowStart);
  const mountedRef = useRef(false);
  const scheduledUpdateFrameRef = useRef(0);
  const pendingPageUpdateRef = useRef(null);
  const flipStateRef = useRef("read");
  const lastAppliedPagesSignatureRef = useRef("");
  const latestPagesRef = useRef(pages);
  const latestPagesSignatureRef = useRef("");
  const pagesSignature = useMemo(() => buildPagesSignature(pages), [pages]);

  const scheduleInstanceUpdate = useCallback((callback) => {
    if (scheduledUpdateFrameRef.current) {
      window.cancelAnimationFrame(scheduledUpdateFrameRef.current);
    }
    scheduledUpdateFrameRef.current = window.requestAnimationFrame(() => {
      scheduledUpdateFrameRef.current = 0;
      const instance = pageFlipRef.current;
      if (!instance) return;
      callback(instance);
    });
  }, []);

  useEffect(() => {
    onFlipRef.current = onFlip;
  }, [onFlip]);

  useEffect(() => {
    onPageSetRef.current = onPageSet;
  }, [onPageSet]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onFlipStateChangeRef.current = onFlipStateChange;
  }, [onFlipStateChange]);

  useEffect(() => {
    onOrientationChangeRef.current = onOrientationChange;
  }, [onOrientationChange]);

  useEffect(() => {
    windowKeyRef.current = windowKey;
  }, [windowKey]);

  useEffect(() => {
    windowStartRef.current = Math.max(0, Number(windowStart) || 0);
  }, [windowStart]);

  useEffect(() => {
    startPageRef.current = Math.max(0, Number(startPage) || 0);
  }, [startPage]);

  useEffect(() => {
    ttsActivePageIndexRef.current = ttsActivePageIndex;
  }, [ttsActivePageIndex]);

  useEffect(() => {
    visualPageIndexRef.current = visualPageIndex;
  }, [visualPageIndex]);

  useEffect(() => {
    latestPagesRef.current = pages;
    latestPagesSignatureRef.current = pagesSignature;
  }, [pages, pagesSignature]);

  const applyPageUpdate = useCallback(
    ({ nextPages = latestPagesRef.current, signature = latestPagesSignatureRef.current, pageIndex = null } = {}) => {
      const instance = pageFlipRef.current;
      if (!instance || !mountedRef.current || !Array.isArray(nextPages) || !nextPages.length) return;

      const nextPageIndex =
        pageIndex ??
        instance.getCurrentPageIndex?.() ??
        stablePageIndexRef.current ??
        0;

      scheduleInstanceUpdate((scheduledInstance) => {
        const nodes = buildPageNodes(nextPages);
        const fallbackPageIndex = Math.max(0, Number(nextPageIndex) || 0);
        debugAdapterEvent("apply-page-update", {
          requestedPageIndex: nextPageIndex,
          fallbackPageIndex,
          currentPageIndex: scheduledInstance.getCurrentPageIndex?.() ?? null,
          signature,
        });
        scheduledInstance.updateFromHtml?.(nodes);
        const appliedPageIndex = scheduledInstance.getCurrentPageIndex?.() ?? fallbackPageIndex;
        if (appliedPageIndex !== fallbackPageIndex) {
          debugAdapterEvent("apply-page-update-turn-to-page", {
            appliedPageIndex,
            fallbackPageIndex,
          });
          scheduledInstance.turnToPage(fallbackPageIndex);
        }
        stablePageIndexRef.current =
          scheduledInstance.getCurrentPageIndex?.() ?? appliedPageIndex ?? fallbackPageIndex;
        lastAppliedPagesSignatureRef.current = signature;
      });
    },
    [scheduleInstanceUpdate]
  );

  const emitPageSet = useCallback((localPageIndex, source = "turn") => {
    const safePageIndex = Math.max(0, Number(localPageIndex) || 0);
    window.requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      const settledPageIndex =
        pageFlipRef.current?.getCurrentPageIndex?.() ??
        stablePageIndexRef.current ??
        safePageIndex;
      stablePageIndexRef.current = Math.max(0, Number(settledPageIndex) || 0);
      onPageSetRef.current?.({
        windowKey: windowKeyRef.current,
        windowStart: windowStartRef.current,
        localPageIndex: stablePageIndexRef.current,
        source,
      });
    });
  }, []);

  useImperativeHandle(ref, () => ({
    flipNext() {
      pageFlipRef.current?.flipNext("top");
    },
    flipPrev() {
      pageFlipRef.current?.flipPrev("top");
    },
    turnToPage(pageIndex) {
      stablePageIndexRef.current = Math.max(0, Number(pageIndex) || 0);
      debugAdapterEvent("imperative-turn-to-page", {
        pageIndex: stablePageIndexRef.current,
      });
      pageFlipRef.current?.turnToPage?.(pageIndex);
    },
    setPage(pageIndex) {
      const safePageIndex = Math.max(0, Number(pageIndex) || 0);
      stablePageIndexRef.current = safePageIndex;
      debugAdapterEvent("imperative-set-page", {
        pageIndex: safePageIndex,
      });
      pageFlipRef.current?.turnToPage?.(safePageIndex);
      emitPageSet(safePageIndex, "turn");
    },
    getCurrentPageIndex() {
      return pageFlipRef.current?.getCurrentPageIndex?.() ?? stablePageIndexRef.current ?? 0;
    },
    getHostElement() {
      return hostRef.current;
    },
    refreshLayout() {
      scheduleInstanceUpdate((instance) => {
        instance.update?.();
      });
    },
  }), [emitPageSet, scheduleInstanceUpdate]);

  useEffect(() => {
    if (!hostRef.current || !pages.length || pageFlipRef.current) return undefined;

    let active = true;
    const hostElement = hostRef.current;
    const initialPresentationMode = stablePresentationModeRef.current;
    const initialPages = latestPagesRef.current;
    const initialPagesSignature = latestPagesSignatureRef.current;

    async function mount() {
      const pageFlipModule = await import("page-flip");
      if (!active || !hostElement || pageFlipRef.current) return;

      const PageFlip =
        pageFlipModule.PageFlip || pageFlipModule.default?.PageFlip || pageFlipModule.default;
      const initialPageIndex = startPageRef.current;
      const nodes = buildPageNodes(initialPages);
      hostElement.innerHTML = "";
      const instance = new PageFlip(hostElement, {
        startPage: initialPageIndex,
        width: FLIPBOOK_CANONICAL_PAGE_WIDTH,
        height: FLIPBOOK_CANONICAL_PAGE_HEIGHT,
        size: "fixed",
        minWidth: FLIPBOOK_CANONICAL_PAGE_WIDTH,
        maxWidth: FLIPBOOK_CANONICAL_PAGE_WIDTH,
        minHeight: FLIPBOOK_CANONICAL_PAGE_HEIGHT,
        maxHeight: FLIPBOOK_CANONICAL_PAGE_HEIGHT,
        showCover,
        usePortrait: true,
        drawShadow: true,
        maxShadowOpacity: 0.12,
        flippingTime: 610,
        autoSize: false,
        mobileScrollSupport: true,
        disableFlipByClick: false,
        showPageCorners: false,
      });
      pageFlipRef.current = instance;
      mountedRef.current = true;
      instance.on("flip", (event) => {
        if (!active) return;
        const nextPageIndex = Math.max(0, Number(event.data) || 0);
        stablePageIndexRef.current = nextPageIndex;
        onFlipRef.current?.({
          windowKey: windowKeyRef.current,
          windowStart: windowStartRef.current,
          localPageIndex: nextPageIndex,
          source: "flip",
        });
      });
      instance.on("changeOrientation", (event) => {
        if (!active) return;
        onOrientationChangeRef.current?.({
          windowKey: windowKeyRef.current,
          windowStart: windowStartRef.current,
          isPortrait: event.data === "portrait",
          source: "orientation",
        });
      });
      instance.on("changeState", (event) => {
        if (!active) return;
        flipStateRef.current = event.data || "read";
        onFlipStateChangeRef.current?.({
          windowKey: windowKeyRef.current,
          flipState: flipStateRef.current,
        });
        if (flipStateRef.current !== "read") {
          return;
        }

        const pendingUpdate = pendingPageUpdateRef.current;
        if (!pendingUpdate) return;
        pendingPageUpdateRef.current = null;
        applyPageUpdate(pendingUpdate);
      });
      instance.loadFromHTML(nodes);
      lastAppliedPagesSignatureRef.current = initialPagesSignature;
      if (typeof instance.updateOrientation === "function") {
        instance.updateOrientation(initialPresentationMode === "single" ? "portrait" : "landscape");
      }
      const mountedPageIndex = instance.getCurrentPageIndex?.() ?? initialPageIndex;
      if (mountedPageIndex !== initialPageIndex) {
        debugAdapterEvent("mount-turn-to-page", {
          mountedPageIndex,
          initialPageIndex,
        });
        instance.turnToPage(initialPageIndex);
      }
      stablePageIndexRef.current = instance.getCurrentPageIndex?.() ?? initialPageIndex;
      stablePresentationModeRef.current = initialPresentationMode;
      onOrientationChangeRef.current?.({
        windowKey: windowKeyRef.current,
        windowStart: windowStartRef.current,
        isPortrait: initialPresentationMode === "single",
        source: "orientation",
      });
      window.requestAnimationFrame(() => {
        if (!active) return;
        const readyPageIndex =
          pageFlipRef.current?.getCurrentPageIndex?.() ??
          stablePageIndexRef.current ??
          initialPageIndex;
        onReadyRef.current?.({
          windowKey: windowKeyRef.current,
          windowStart: windowStartRef.current,
          localPageIndex: Math.max(0, Number(readyPageIndex) || 0),
          source: "ready",
        });
      });
    }

    mount();

    return () => {
      active = false;
    };
  }, [applyPageUpdate, pages.length, showCover]);

  useEffect(() => {
    const instance = pageFlipRef.current;
    if (!instance || !mountedRef.current || !pages.length) return;
    if (pagesSignature === lastAppliedPagesSignatureRef.current) return;

    const currentPageIndex =
      instance.getCurrentPageIndex?.() ??
      stablePageIndexRef.current ??
      startPageRef.current;
    const nextUpdate = {
      nextPages: pages,
      signature: pagesSignature,
      pageIndex: currentPageIndex,
    };
    if (flipStateRef.current !== "read") {
      pendingPageUpdateRef.current = nextUpdate;
      return;
    }
    applyPageUpdate(nextUpdate);
  }, [applyPageUpdate, pages, pagesSignature]);

  useEffect(() => {
    const hostElement = hostRef.current;
    return () => {
      mountedRef.current = false;
      if (scheduledUpdateFrameRef.current) {
        window.cancelAnimationFrame(scheduledUpdateFrameRef.current);
        scheduledUpdateFrameRef.current = 0;
      }
      pageFlipRef.current?.destroy?.();
      pageFlipRef.current = null;
      pendingPageUpdateRef.current = null;
      if (hostElement) {
        hostElement.innerHTML = "";
      }
    };
  }, []);

  useEffect(() => {
    const instance = pageFlipRef.current;
    if (!instance || !pages.length) return;

    const previousPresentationMode = stablePresentationModeRef.current;
    const currentPageIndex =
      visualPageIndexRef.current ??
      instance.getCurrentPageIndex?.() ??
      stablePageIndexRef.current ??
      startPageRef.current;
    const resumePageIndex = resolveResumePageIndex({
      currentPageIndex,
      previousPresentationMode,
      nextPresentationMode: presentationMode,
      ttsActivePageIndex: ttsActivePageIndexRef.current,
      pageCount: pages.length,
    });

    stablePageIndexRef.current = resumePageIndex;
    stablePresentationModeRef.current = presentationMode;

    scheduleInstanceUpdate((scheduledInstance) => {
      if (typeof scheduledInstance.updateOrientation === "function") {
        scheduledInstance.updateOrientation(presentationMode === "single" ? "portrait" : "landscape");
      }

      debugAdapterEvent("presentation-resume-turn-to-page", {
        resumePageIndex,
        currentPageIndex,
        previousPresentationMode,
        presentationMode,
      });
      scheduledInstance.turnToPage(resumePageIndex);
      stablePageIndexRef.current = scheduledInstance.getCurrentPageIndex?.() ?? resumePageIndex;
      onOrientationChangeRef.current?.({
        windowKey: windowKeyRef.current,
        windowStart: windowStartRef.current,
        isPortrait: presentationMode === "single",
        source: "orientation",
      });
      emitPageSet(stablePageIndexRef.current, "turn");
    });
  }, [emitPageSet, pages.length, presentationMode, scheduleInstanceUpdate]);

  return (
    <div
      ref={hostRef}
      className="flipbook-animation-host"
      style={{
        width: `${isPortrait ? FLIPBOOK_CANONICAL_PAGE_WIDTH : FLIPBOOK_CANONICAL_SPREAD_WIDTH}px`,
        height: `${FLIPBOOK_CANONICAL_PAGE_HEIGHT}px`,
      }}
    />
  );
});

export default FlipAnimationAdapter;
