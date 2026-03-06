"use client";

import { useEffect, useMemo, useRef } from "react";
import { toRichTextHtml } from "@/lib/rich-text";

function ToolbarButton({ title, onClick, disabled, children, className = "" }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded border border-transparent px-1 text-xs text-foreground transition hover:border-border hover:bg-surface disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export default function SimpleWysiwygEditor({
  value,
  onChange,
  placeholder = "",
  minHeightClass = "min-h-[120px]",
  disabled = false,
  className = "",
  quickInsertTokens = [],
}) {
  const editorRef = useRef(null);
  const focusedRef = useRef(false);
  const placeholderVisible = useMemo(
    () => !String(value || "").replace(/<[^>]+>/g, "").trim(),
    [value]
  );

  function emitChangeFromNode() {
    const node = editorRef.current;
    if (!node) return;
    onChange?.(node.innerHTML);
  }

  function runCommand(command) {
    if (disabled) return;
    const node = editorRef.current;
    if (!node) return;
    node.focus();
    document.execCommand(command, false);
    emitChangeFromNode();
  }

  function insertToken(token) {
    if (disabled) return;
    const text = String(token || "");
    if (!text) return;
    const node = editorRef.current;
    if (!node) return;
    node.focus();
    document.execCommand("insertText", false, text);
    emitChangeFromNode();
  }

  useEffect(() => {
    const node = editorRef.current;
    if (!node || focusedRef.current) return;
    const normalized = toRichTextHtml(value);
    if (node.innerHTML !== normalized) {
      node.innerHTML = normalized;
    }
  }, [value]);

  return (
    <div className={`overflow-hidden rounded-lg border border-border/90 bg-surface ${disabled ? "opacity-70" : ""} ${className}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border/80 bg-[#f3f4f6] px-2 py-1 dark:bg-surface-2">
        <ToolbarButton title="Negrita (Ctrl+B)" onClick={() => runCommand("bold")} disabled={disabled} className="font-bold">
          B
        </ToolbarButton>
        <ToolbarButton title="Cursiva (Ctrl+I)" onClick={() => runCommand("italic")} disabled={disabled} className="italic">
          I
        </ToolbarButton>
        <ToolbarButton title="Subrayado (Ctrl+U)" onClick={() => runCommand("underline")} disabled={disabled} className="underline">
          U
        </ToolbarButton>
        {Array.isArray(quickInsertTokens)
          ? quickInsertTokens
              .map((token) => String(token || "").trim())
              .filter(Boolean)
              .map((token) => (
                <ToolbarButton
                  key={`insert-token-${token}`}
                  title={`Insertar ${token}`}
                  onClick={() => insertToken(token)}
                  disabled={disabled}
                  className="font-semibold"
                >
                  + {token}
                </ToolbarButton>
              ))
          : null}
      </div>

      <div className="relative">
        {placeholderVisible ? (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted">{placeholder}</span>
        ) : null}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
            emitChangeFromNode();
          }}
          onInput={emitChangeFromNode}
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const key = String(event.key || "").toLowerCase();
            if (key === "b") {
              event.preventDefault();
              runCommand("bold");
              return;
            }
            if (key === "i") {
              event.preventDefault();
              runCommand("italic");
              return;
            }
            if (key === "u") {
              event.preventDefault();
              runCommand("underline");
            }
          }}
          className={`w-full px-3 py-2 text-sm leading-relaxed text-foreground outline-none ${minHeightClass}`}
        />
      </div>
    </div>
  );
}
