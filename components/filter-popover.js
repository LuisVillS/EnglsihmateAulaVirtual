"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function useViewportMode() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function FilterPopoverSection({ label, description = "", children }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6a7690]">{label}</p>
        {description ? <p className="mt-1 text-sm text-[#7c879d]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function FilterChipGroup({
  options = [],
  value,
  onChange,
  multiple = false,
  dropdownThreshold = 7,
  emptyLabel = "All options",
}) {
  const selectedValues = useMemo(() => {
    if (multiple) {
      return new Set(Array.isArray(value) ? value : []);
    }
    return new Set(value ? [value] : []);
  }, [multiple, value]);

  function handleSelect(nextValue) {
    if (!onChange) return;
    if (multiple) {
      const next = new Set(selectedValues);
      if (next.has(nextValue)) {
        next.delete(nextValue);
      } else {
        next.add(nextValue);
      }
      onChange(Array.from(next));
      return;
    }

    onChange(value === nextValue ? "" : nextValue);
  }

  if (options.length > dropdownThreshold) {
    return (
      <select
        multiple={multiple}
        value={multiple ? Array.from(selectedValues) : (value || "")}
        onChange={(event) => {
          if (!onChange) return;
          if (multiple) {
            onChange(Array.from(event.target.selectedOptions).map((option) => option.value));
            return;
          }
          onChange(event.target.value);
        }}
        className="w-full rounded-[16px] border border-[rgba(16,52,116,0.14)] bg-[#fbfcff] px-4 py-3 text-sm text-[#1f2432] focus:border-[#103474] focus:outline-none"
      >
        {!multiple ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => {
          const optionValue = String(option?.value ?? option?.key ?? "");
          return (
            <option key={optionValue || option?.label} value={optionValue}>
              {option.label}
            </option>
          );
        })}
      </select>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const optionValue = String(option?.value ?? option?.key ?? "");
        const active = selectedValues.has(optionValue);
        return (
          <button
            key={optionValue || option?.label}
            type="button"
            onClick={() => handleSelect(optionValue)}
            className={joinClasses(
              "rounded-full border px-3.5 py-2 text-sm font-semibold transition",
              active
                ? "border-[#103474] bg-[#103474] text-white shadow-[0_14px_24px_rgba(16,52,116,0.18)]"
                : "border-[rgba(16,52,116,0.14)] bg-white text-[#103474] hover:border-[rgba(16,52,116,0.28)] hover:bg-[#f5f8ff]"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function FilterPopover({
  title = "Filters",
  buttonLabel = "Filters",
  buttonIcon = null,
  activeCount = 0,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  width = 420,
  buttonClassName = "",
  panelClassName = "",
  children,
  footer = null,
}) {
  const isControlled = typeof controlledOpen === "boolean";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = useCallback((nextValue) => {
    if (!isControlled) setInternalOpen(nextValue);
    onOpenChange?.(nextValue);
  }, [isControlled, onOpenChange]);

  const isMobile = useViewportMode();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width });

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || isMobile) return undefined;
    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isMobile, open, setOpen]);

  useLayoutEffect(() => {
    if (!open || isMobile || typeof window === "undefined") return undefined;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const nextWidth = Math.min(width, window.innerWidth - (viewportPadding * 2));
      const preferredLeft = rect.right - nextWidth;
      const left = Math.max(viewportPadding, Math.min(preferredLeft, window.innerWidth - nextWidth - viewportPadding));
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const estimatedHeight = 560;
      const shouldOpenUpward = spaceBelow < 280 && rect.top > estimatedHeight / 2;
      const top = shouldOpenUpward
        ? Math.max(viewportPadding, rect.top - estimatedHeight - 10)
        : Math.min(window.innerHeight - viewportPadding, rect.bottom + 10);

      setPosition({
        top,
        left,
        width: nextWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isMobile, open, width]);

  const content = open && typeof window !== "undefined"
    ? createPortal(
        <div
          className={joinClasses(
            "fixed inset-0 z-[1400]",
            isMobile ? "pointer-events-auto" : "pointer-events-none"
          )}
          onMouseDown={isMobile ? () => setOpen(false) : undefined}
        >
          <div className={joinClasses("absolute inset-0", isMobile ? "bg-[rgba(15,23,42,0.24)]" : "bg-transparent")} />
          <div
            ref={panelRef}
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              ...(isMobile ? {} : { top: position.top, left: position.left, width: position.width }),
              animation: isMobile ? "filter-sheet-enter 180ms ease-out" : "filter-popover-enter 180ms ease-out",
            }}
            className={joinClasses(
              "pointer-events-auto flex flex-col overflow-visible border border-[rgba(16,52,116,0.12)] bg-white text-[#0f172a] shadow-[0_24px_54px_rgba(15,23,42,0.16)] transition duration-200 ease-out",
              isMobile
                ? "absolute inset-x-0 bottom-0 rounded-t-[28px]"
                : "absolute rounded-[28px]",
              panelClassName
            )}
          >
            <div className="flex items-center justify-between border-b border-[rgba(16,52,116,0.08)] px-5 py-4">
              <h3 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#103474]">{title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(16,52,116,0.12)] text-[#5a6883] transition hover:border-[rgba(16,52,116,0.24)] hover:bg-[#f3f7ff] hover:text-[#103474]"
                aria-label="Close filters"
              >
                <XIcon />
              </button>
            </div>

            <div className="px-5 py-5">
              {typeof children === "function" ? children({ close: () => setOpen(false), isMobile }) : children}
            </div>

            {footer ? (
              <div className="border-t border-[rgba(16,52,116,0.08)] bg-white px-5 py-4">
                {typeof footer === "function" ? footer({ close: () => setOpen(false), isMobile }) : footer}
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <style>{`
        @keyframes filter-popover-enter {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes filter-sheet-enter {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={joinClasses(
          "inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(16,52,116,0.1)] bg-white px-5 py-2 text-sm font-semibold text-[#103474] transition hover:border-[rgba(16,52,116,0.22)] hover:bg-[#f5f8ff]",
          open || activeCount ? "border-[#103474]/16 bg-[#ecf2ff]" : "",
          buttonClassName
        )}
      >
        {buttonIcon}
        <span>{activeCount ? `${buttonLabel} (${activeCount})` : buttonLabel}</span>
      </button>
      {content}
    </>
  );
}
