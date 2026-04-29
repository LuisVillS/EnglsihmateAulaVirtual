"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { analyzeBlogEditorContent, normalizeEditableSlug } from "@/lib/blog/editor-validation";

const INITIAL_STATE = { success: false, error: null };
const RED_CARD_TOKEN = "[red card]";
const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 22, 28, 32, 40, 48];
const TOP_LEVEL_BLOCK_TAGS = new Set(["p", "div", "h2", "h3", "h4", "blockquote", "ul", "ol", "hr"]);
const TOOLBAR_ICON_NAMES = {
  Undo: "undo",
  Redo: "redo",
  "Bulleted list": "bulletList",
  "Numbered list": "numberList",
  "Continuar numeración": "continueList",
  "Reiniciar numeración": "restartList",
  Quote: "quote",
  "Align left": "alignLeft",
  "Align center": "alignCenter",
  "Align right": "alignRight",
  "Add link": "link",
  "Add image": "image",
  "Add video": "video",
  "Add divider": "divider",
};

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/&lt;s&gt;(.+?)&lt;\/s&gt;/g, '<s>$1</s>')
    .replace(/&lt;mark&gt;(.+?)&lt;\/mark&gt;/g, '<mark class="rounded bg-yellow-100 px-1">$1</mark>')
    .replace(
      /&lt;span style=&quot;color:\s*(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)&quot;&gt;(.+?)&lt;\/span&gt;/g,
      '<span style="color: $1">$2</span>'
    )
    .replace(
      /&lt;span style=&quot;font-size:\s*([0-9]{1,3})px&quot;&gt;(.+?)&lt;\/span&gt;/g,
      '<span style="font-size: $1px">$2</span>'
    )
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" class="my-4 max-h-80 rounded-2xl border border-slate-200 object-cover" />')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" class="font-semibold text-[#103474] underline" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function resolveVideoEmbedUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtube.com")) {
      const embedPath = url.pathname.match(/^\/embed\/([^/?#]+)/);
      if (embedPath?.[1]) {
        return `https://www.youtube.com/embed/${encodeURIComponent(embedPath[1])}`;
      }
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
    }
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
    }
    if (url.hostname.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : "";
    }
  } catch {
    return "";
  }
  return "";
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const blocks = [];
  let index = 0;

  function renderListItemContent(itemLines = []) {
    const segments = [];
    let paragraphLines = [];

    function flushParagraph() {
      if (!paragraphLines.length) return;
      const content = renderInlineMarkdown(paragraphLines.join(" "));
      segments.push(content);
      paragraphLines = [];
    }

    for (const line of itemLines) {
      if (!line) {
        flushParagraph();
        continue;
      }
      paragraphLines.push(line);
    }

    flushParagraph();
    return segments.join("<br /><br />");
  }

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const videoMatch = trimmed.match(/^@\[video]\((https?:\/\/[^)\s]+)\)$/);
    if (videoMatch) {
      const embedUrl = resolveVideoEmbedUrl(videoMatch[1]);
      if (embedUrl) {
        blocks.push(
          `<div class="my-5 aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><iframe src="${embedUrl}" title="Video embed" class="h-full w-full" allowfullscreen loading="lazy"></iframe></div>`
        );
      } else {
        blocks.push(`<p class="my-4 text-sm text-red-700">Unsupported video URL: ${escapeHtml(videoMatch[1])}</p>`);
      }
      index += 1;
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      blocks.push(`<h4 class="mt-5 text-lg font-bold text-slate-950">${renderInlineMarkdown(trimmed.slice(5))}</h4>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(`<h3 class="mt-6 text-xl font-bold text-slate-950">${renderInlineMarkdown(trimmed.slice(4))}</h3>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(`<h2 class="mt-7 text-2xl font-bold text-slate-950">${renderInlineMarkdown(trimmed.slice(3))}</h2>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      blocks.push(
        `<blockquote class="my-4 border-l-4 border-[#103474] bg-[#eef3ff] px-4 py-3 text-slate-700">${renderInlineMarkdown(trimmed.slice(2))}</blockquote>`
      );
      index += 1;
      continue;
    }

    if (trimmed === "---") {
      blocks.push('<hr class="my-6 border-slate-200" />');
      index += 1;
      continue;
    }

    const unorderedListMatch = trimmed.match(/^-\s*(.*)$/);
    const orderedListMatch = trimmed.match(/^(\d+)\.\s*(.*)$/);

    if (unorderedListMatch || orderedListMatch) {
      const listType = orderedListMatch ? "ol" : "ul";
      const listStart = orderedListMatch ? Math.max(1, Number(orderedListMatch[1]) || 1) : 1;
      const listItems = [];

      while (index < lines.length) {
        const currentTrimmed = lines[index].trim();
        const currentOrdered = currentTrimmed.match(/^(\d+)\.\s*(.*)$/);
        const currentUnordered = currentTrimmed.match(/^-\s*(.*)$/);
        const itemMatch = listType === "ol" ? currentOrdered : currentUnordered;

        if (!itemMatch) break;

        const itemLines = [];
        const firstLine = listType === "ol" ? itemMatch[2] : itemMatch[1];
        if (firstLine) itemLines.push(firstLine);
        index += 1;

        while (index < lines.length) {
          const nextTrimmed = lines[index].trim();
          const nextOrdered = nextTrimmed.match(/^(\d+)\.\s*(.*)$/);
          const nextUnordered = nextTrimmed.match(/^-\s*(.*)$/);
          const nextIsSameListItem = listType === "ol" ? Boolean(nextOrdered) : Boolean(nextUnordered);

          if (nextIsSameListItem) break;

          if (!nextTrimmed) {
            let lookahead = index + 1;
            while (lookahead < lines.length && !lines[lookahead].trim()) {
              lookahead += 1;
            }
            const futureTrimmed = lines[lookahead]?.trim() || "";
            const futureOrdered = futureTrimmed.match(/^(\d+)\.\s*(.*)$/);
            const futureUnordered = futureTrimmed.match(/^-\s*(.*)$/);
            const futureIsSameListItem = listType === "ol" ? Boolean(futureOrdered) : Boolean(futureUnordered);

            if (!futureTrimmed || futureIsSameListItem) {
              index = lookahead;
              break;
            }

            itemLines.push("");
            index += 1;
            continue;
          }

          itemLines.push(nextTrimmed);
          index += 1;
        }

        listItems.push(renderListItemContent(itemLines));
      }

      const tag = listType === "ol" ? "ol" : "ul";
      const listClass = listType === "ol" ? "list-decimal" : "list-disc";
      const startAttribute = listType === "ol" && listStart > 1 ? ` start="${listStart}"` : "";
      blocks.push(`<${tag}${startAttribute} class="my-4 ${listClass} space-y-2 pl-6">${listItems.map((item) => `<li>${item}</li>`).join("")}</${tag}>`);
      continue;
    }

    blocks.push(`<p class="my-4 leading-7 text-slate-700">${renderInlineMarkdown(trimmed)}</p>`);
    index += 1;
  }

  return blocks.join("") || "<p><br></p>";
}

function cleanMarkdown(value) {
  return String(value || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineStyle(style = "") {
  const color = String(style).match(/color:\s*([^;"]+)/i)?.[1]?.trim();
  const fontSize = String(style).match(/font-size:\s*([0-9]+px)/i)?.[1]?.trim();
  const parts = [];
  if (color) parts.push(`color: ${color}`);
  if (fontSize) parts.push(`font-size: ${fontSize}`);
  return parts.join("; ");
}

function htmlToMarkdown(html) {
  if (typeof document === "undefined") return "";
  const container = document.createElement("div");
  container.innerHTML = html || "";

  function isIgnorableSibling(node) {
    if (!node) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      return !String(node.textContent || "").trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return true;

    const tag = node.tagName.toLowerCase();
    if (tag === "br") return true;

    if (tag === "p" || tag === "div") {
      const text = String(node.textContent || "").replace(/\u00a0/g, " ").trim();
      const hasMeaningfulChildren = Array.from(node.children).some((child) => child.tagName?.toLowerCase() !== "br");
      return !text && !hasMeaningfulChildren;
    }

    return false;
  }

  function childrenToMarkdown(node) {
    return Array.from(node.childNodes).map(nodeToMarkdown).join("");
  }

  function nodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    const content = childrenToMarkdown(node);

    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return content ? `**${content}**` : "";
    if (tag === "em" || tag === "i") return content ? `*${content}*` : "";
    if (tag === "u") return content ? `<u>${content}</u>` : "";
    if (tag === "s" || tag === "strike") return content ? `<s>${content}</s>` : "";
    if (tag === "mark") return content ? `<mark>${content}</mark>` : "";
    if (tag === "span") {
      const style = normalizeInlineStyle(node.getAttribute("style") || "");
      return style && content ? `<span style="${style}">${content}</span>` : content;
    }
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      return href ? `[${content || href}](${href})` : content;
    }
    if (tag === "img") {
      const src = node.getAttribute("src") || "";
      const alt = node.getAttribute("alt") || "Alt text";
      return src ? `![${alt}](${src})` : "";
    }
    if (tag === "iframe") {
      const source = node.getAttribute("data-video-source") || node.getAttribute("src") || "";
      return source ? `@[video](${source})\n\n` : "";
    }
    if (tag === "h2") return `## ${content.trim()}\n\n`;
    if (tag === "h3") return `### ${content.trim()}\n\n`;
    if (tag === "h4") return `#### ${content.trim()}\n\n`;
    if (tag === "blockquote") return `> ${content.trim()}\n\n`;
    if (tag === "hr") return "---\n\n";
    if (tag === "ul") {
      const items = Array.from(node.children)
        .filter((child) => child.tagName?.toLowerCase() === "li")
        .map((child) => `- ${childrenToMarkdown(child).trim()}`)
        .join("\n");
      return items ? `${items}\n\n` : "";
    }
    if (tag === "ol") {
      const explicitStart = node.hasAttribute("start") ? Math.max(1, Number(node.getAttribute("start")) || 1) : 1;
      const items = Array.from(node.children)
        .filter((child) => child.tagName?.toLowerCase() === "li")
        .map((child, index) => `${explicitStart + index}. ${childrenToMarkdown(child).trim()}`)
        .join("\n");
      return items ? `${items}\n\n` : "";
    }
    if (tag === "li") return `${content.trim()}\n`;
    if (tag === "p" || tag === "div") return content.trim() ? `${content.trim()}\n\n` : "\n";
    return content;
  }

  return cleanMarkdown(childrenToMarkdown(container));
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function Field({ label, children, helper = "" }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">{label}</span>
      {children}
      {helper ? <span className="block text-xs leading-5 text-[#94a3b8]">{helper}</span> : null}
    </label>
  );
}

const STATUS_STYLES = {
  good: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Good",
  },
  warning: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    text: "text-amber-700",
    dot: "bg-amber-500",
    label: "Warning",
  },
  invalid: {
    badge: "border-red-200 bg-red-50 text-red-700",
    text: "text-red-700",
    dot: "bg-red-500",
    label: "Blocking",
  },
};

function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.warning;
}

function MetricFeedback({ metric, unit = "characters", children = null }) {
  const style = getStatusStyle(metric.status);
  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 text-xs leading-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[#334155]">
          {metric.count} {unit}
        </span>
        <span className="text-[#94a3b8]">Recommended: {metric.recommendedText}</span>
        <span className={`rounded-full border px-2 py-0.5 font-semibold ${style.badge}`}>{style.label}</span>
      </div>
      <p className={`mt-1 font-medium ${style.text}`}>{metric.message}</p>
      {metric.helper ? <p className="mt-1 text-[#64748b]">{metric.helper}</p> : null}
      {children}
    </div>
  );
}

function QualityChecklistItem({ label, status, detail }) {
  const style = getStatusStyle(status);
  return (
    <li className="flex items-start gap-2 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${style.dot}`} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#0f172a]">{label}</span>
        <span className="block text-xs leading-5 text-[#64748b]">{detail}</span>
      </span>
    </li>
  );
}

function BlogQualityPanel({ analysis }) {
  const metrics = analysis.metrics;
  const hasHeadingWarning = analysis.warnings.some((warning) => warning.field === "headings");
  const hasParagraphWarning = analysis.warnings.some((warning) => warning.field === "paragraphs");
  const headingStatus = hasHeadingWarning ? "warning" : "good";
  const readyStatus = analysis.readyToPublish ? "good" : "invalid";

  return (
    <aside className="rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">Quality checklist</p>
          <h3 className="mt-1 text-lg font-bold text-[#0f172a]">
            Ready to publish: {analysis.readyToPublish ? "Yes" : "No"}
          </h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getStatusStyle(readyStatus).badge}`}>
          {analysis.hardErrors.length ? `${analysis.hardErrors.length} blocker${analysis.hardErrors.length === 1 ? "" : "s"}` : "No blockers"}
        </span>
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <QualityChecklistItem label="SEO title length" status={metrics.seoTitle.status} detail={`${metrics.seoTitle.count} characters`} />
        <QualityChecklistItem label="SEO description length" status={metrics.seoDescription.status} detail={`${metrics.seoDescription.count} characters`} />
        <QualityChecklistItem label="Slug quality" status={metrics.slug.status} detail={`${metrics.slug.count} words`} />
        <QualityChecklistItem label="H1 length" status={metrics.title.status} detail={`${metrics.title.count} characters`} />
        <QualityChecklistItem label="Excerpt length" status={metrics.excerpt.status} detail={`${metrics.excerpt.count} characters`} />
        <QualityChecklistItem label="Word count" status={metrics.body.status} detail={`${metrics.body.count} words - ${metrics.body.tierLabel}`} />
        <QualityChecklistItem label="Heading structure" status={headingStatus} detail={`${metrics.body.headingCount} H2/H3/H4 headings`} />
        <QualityChecklistItem
          label="Paragraph readability"
          status={hasParagraphWarning ? "warning" : "good"}
          detail={hasParagraphWarning ? "Break up very long paragraphs." : "Paragraph length looks manageable."}
        />
      </ul>
    </aside>
  );
}

function ToolbarButton({ children, onClick, title = "", active = false }) {
  if (
    title === "Decrease text size" ||
    title === "Increase text size" ||
    title === "Apply text size" ||
    title === "Highlight" ||
    title === "Insert link (Ctrl+K)" ||
    title === "Insert image URL" ||
    title === "Insert video" ||
    title === "Divider"
  ) {
    return null;
  }

  const iconName = TOOLBAR_ICON_NAMES[title];

  return (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-semibold transition ${
        active
          ? "bg-[#e8f0ff] text-[#103474]"
          : "text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#111827]"
      }`}
    >
      {iconName ? <EditorIcon name={iconName} /> : children}
    </button>
  );
}

function EditorIcon({ name }) {
  const commonProps = {
    className: "h-4 w-4",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "2",
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
  };

  const icons = {
    undo: (
      <svg {...commonProps}>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
      </svg>
    ),
    redo: (
      <svg {...commonProps}>
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H10a6 6 0 0 0 0 12h2" />
      </svg>
    ),
    bulletList: (
      <svg {...commonProps}>
        <path d="M9 6h11" />
        <path d="M9 12h11" />
        <path d="M9 18h11" />
        <path d="M4 6h.01" />
        <path d="M4 12h.01" />
        <path d="M4 18h.01" />
      </svg>
    ),
    numberList: (
      <svg {...commonProps}>
        <path d="M10 6h10" />
        <path d="M10 12h10" />
        <path d="M10 18h10" />
        <path d="M4 6h1v4" />
        <path d="M4 10h2" />
        <path d="M4 14a2 2 0 0 1 4 0c0 1.5-2 2-4 4h4" />
      </svg>
    ),
    continueList: (
      <svg {...commonProps}>
        <path d="M10 6h10" />
        <path d="M10 12h10" />
        <path d="M10 18h10" />
        <path d="M4 6h1v4" />
        <path d="M4 10h2" />
        <path d="M4 14a2 2 0 0 1 4 0c0 1.5-2 2-4 4h4" />
        <path d="m18 3 3 3-3 3" />
        <path d="M21 6h-5" />
      </svg>
    ),
    restartList: (
      <svg {...commonProps}>
        <path d="M4 4v6h6" />
        <path d="M20 12a8 8 0 0 0-13.66-5.66L4 10" />
        <path d="M10 16h10" />
        <path d="M10 20h10" />
        <path d="M5 16h1v4" />
      </svg>
    ),
    quote: (
      <svg {...commonProps}>
        <path d="M7 7h5v5H9a3 3 0 0 0-3 3v2" />
        <path d="M16 7h5v5h-3a3 3 0 0 0-3 3v2" />
      </svg>
    ),
    alignLeft: (
      <svg {...commonProps}>
        <path d="M4 6h16" />
        <path d="M4 12h10" />
        <path d="M4 18h14" />
      </svg>
    ),
    alignCenter: (
      <svg {...commonProps}>
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M5 18h14" />
      </svg>
    ),
    alignRight: (
      <svg {...commonProps}>
        <path d="M4 6h16" />
        <path d="M10 12h10" />
        <path d="M6 18h14" />
      </svg>
    ),
    link: (
      <svg {...commonProps}>
        <path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1.14 1.14" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-2 2A5 5 0 0 0 12 20.07l1.14-1.14" />
      </svg>
    ),
    image: (
      <svg {...commonProps}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10.5" r="1.5" />
        <path d="m21 15-5-5L5 19" />
      </svg>
    ),
    video: (
      <svg {...commonProps}>
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="m17 10 4-2v8l-4-2" />
      </svg>
    ),
    divider: (
      <svg {...commonProps}>
        <path d="M4 12h16" />
        <path d="M8 8h8" />
        <path d="M8 16h8" />
      </svg>
    ),
  };

  return icons[name] || null;
}

function closestElement(node, selector, root) {
  let current = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (current && current !== root) {
    if (current.matches?.(selector)) return current;
    current = current.parentElement;
  }
  return null;
}

function isSelectionInsideEditor(root) {
  if (typeof window === "undefined" || !root) return false;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer);
}

function getDirectListItemCount(list) {
  return Array.from(list?.children || []).filter((child) => child.tagName?.toLowerCase() === "li").length;
}

function isNodeMeaningful(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(String(node.textContent || "").replace(/\u00a0/g, " ").trim());
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return false;
  if (["img", "iframe", "hr", "video"].includes(tag)) return true;
  if (["ul", "ol"].includes(tag)) {
    return Array.from(node.children).some((child) => child.tagName?.toLowerCase() === "li");
  }

  return Array.from(node.childNodes).some(isNodeMeaningful);
}

export default function BlogPostEditor({ post = null, categories = [], action }) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [slugEdited, setSlugEdited] = useState(Boolean(post?.slug));
  const editorRef = useRef(null);
  const hiddenMarkdownRef = useRef(null);
  const contentMarkdownRef = useRef(post?.content_markdown || "");
  const savedSelectionRef = useRef(null);
  const lastRedCardInsertAtRef = useRef(0);
  const [contentSnapshot, setContentSnapshot] = useState(post?.content_markdown || "");
  const [clientPublishErrors, setClientPublishErrors] = useState([]);
  const [toolbar, setToolbar] = useState({ color: "#2563eb", fontSize: "16", block: "p" });
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [sizeCustomEditing, setSizeCustomEditing] = useState(false);
  const [insertDialog, setInsertDialog] = useState({
    open: false,
    type: "link",
    url: "",
    label: "",
    alt: "",
    error: "",
  });
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    highlight: false,
    orderedList: false,
  });
  const [form, setForm] = useState({
    title: post?.title || "",
    slug: post?.slug || "",
    categoryId: post?.category_id || "",
    excerpt: post?.excerpt || "",
    coverImageUrl: post?.cover_image_url || "",
    contentMarkdown: post?.content_markdown || "",
    status: post?.status || "draft",
    publishedAt: formatDateTimeLocal(post?.published_at),
    unpublishedReason: post?.unpublished_reason || "",
    seoTitle: post?.seo_title || "",
    seoDescription: post?.seo_description || "",
  });
  const validationForm = { ...form, contentMarkdown: contentSnapshot };
  const editorAnalysis = analyzeBlogEditorContent(validationForm);
  const metrics = editorAnalysis.metrics;

  useEffect(() => {
    if (!sizeMenuOpen) return undefined;

    function handlePointerDown(event) {
      const sizeMenuContainer = event.target?.closest?.("[data-size-menu]");
      if (!sizeMenuContainer) {
        setSizeMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sizeMenuOpen]);

  useEffect(() => {
    if (!editorRef.current) return;
    contentMarkdownRef.current = form.contentMarkdown;
    setContentSnapshot(form.contentMarkdown);
    if (hiddenMarkdownRef.current) hiddenMarkdownRef.current.value = form.contentMarkdown;
    editorRef.current.innerHTML = markdownToHtml(form.contentMarkdown);
    refreshEditorState();
    // Only hydrate the editable document on mount/post switch. Live edits are owned by the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  function updateField(key, value) {
    const normalizedValue = key === "slug" ? normalizeEditableSlug(value) : value;
    setForm((current) => {
      const next = { ...current, [key]: normalizedValue };
      if (key === "title" && !slugEdited) {
        next.slug = slugify(normalizedValue);
      }
      if (key === "status" && normalizedValue === "unpublished" && !next.unpublishedReason) {
        next.unpublishedReason = "Manually unpublished by an administrator.";
      }
      if (key === "status" && normalizedValue === "published") {
        next.unpublishedReason = "";
      }
      return next;
    });
    if (clientPublishErrors.length) setClientPublishErrors([]);
  }

  function syncEditorMarkdown({ commitState = false } = {}) {
    const markdown = htmlToMarkdown(editorRef.current?.innerHTML || "");
    contentMarkdownRef.current = markdown;
    setContentSnapshot(markdown);
    if (clientPublishErrors.length) setClientPublishErrors([]);
    if (hiddenMarkdownRef.current) hiddenMarkdownRef.current.value = markdown;
    if (commitState) {
      setForm((current) => ({ ...current, contentMarkdown: markdown }));
    }
    return markdown;
  }

  function rememberSelection() {
    if (typeof window === "undefined" || !editorRef.current) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return;
    savedSelectionRef.current = range.cloneRange();
  }

  function getEditorSelectionAnchorNode() {
    if (!editorRef.current) return null;
    if (isSelectionInsideEditor(editorRef.current)) {
      return window.getSelection()?.anchorNode || null;
    }
    return savedSelectionRef.current?.commonAncestorContainer || null;
  }

  function refreshSelectionSnapshot() {
    if (isSelectionInsideEditor(editorRef.current)) {
      rememberSelection();
    }
  }

  function restoreSelection() {
    if (typeof window === "undefined" || !savedSelectionRef.current || !editorRef.current) return;
    if (isSelectionInsideEditor(editorRef.current)) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedSelectionRef.current);
  }

  function refreshEditorState() {
    if (typeof document === "undefined") return;
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode || null;
    const highlightNode = closestElement(anchorNode, "mark", editorRef.current);
    const orderedListNode = closestElement(anchorNode, "ol", editorRef.current);
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      strike: document.queryCommandState("strikeThrough"),
      highlight: Boolean(highlightNode),
      orderedList: Boolean(orderedListNode),
    });
    const block = String(document.queryCommandValue("formatBlock") || "p").toLowerCase().replace(/[<>]/g, "");
    const normalizedBlock = ["h2", "h3", "h4", "blockquote"].includes(block) ? block : "p";
    setToolbar((current) => ({ ...current, block: normalizedBlock }));
  }

  function getCurrentOrderedList() {
    if (!editorRef.current) return null;
    const anchorNode = getEditorSelectionAnchorNode();
    return closestElement(anchorNode, "ol", editorRef.current);
  }

  function getCurrentListItem() {
    if (!editorRef.current) return null;
    const anchorNode = getEditorSelectionAnchorNode();
    return closestElement(anchorNode, "li", editorRef.current);
  }

  function getCurrentList() {
    if (!editorRef.current) return null;
    const anchorNode = getEditorSelectionAnchorNode();
    return closestElement(anchorNode, "ol, ul", editorRef.current);
  }

  function getSelectionRangeWithinEditor() {
    if (typeof window === "undefined" || !editorRef.current) return null;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return editorRef.current.contains(range.commonAncestorContainer) ? range : null;
  }

  function getTopLevelEditorBlock(node) {
    if (!editorRef.current) return null;
    let current = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    while (current && current.parentElement !== editorRef.current) {
      current = current.parentElement;
    }
    if (!current || current.parentElement !== editorRef.current) return null;
    return TOP_LEVEL_BLOCK_TAGS.has(current.tagName?.toLowerCase()) ? current : null;
  }

  function ensureTopLevelParagraph() {
    if (!editorRef.current) return null;
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br>";
    editorRef.current.appendChild(paragraph);
    return paragraph;
  }

  function getSelectedTopLevelBlocks() {
    const range = getSelectionRangeWithinEditor();
    if (!range) return [];

    const topLevelBlocks = Array.from(editorRef.current?.children || []).filter((child) =>
      TOP_LEVEL_BLOCK_TAGS.has(child.tagName?.toLowerCase())
    );

    if (!topLevelBlocks.length) {
      const paragraph = ensureTopLevelParagraph();
      return paragraph ? [paragraph] : [];
    }

    if (range.collapsed) {
      const block = getTopLevelEditorBlock(range.startContainer) || topLevelBlocks[0];
      return block ? [block] : [];
    }

    return topLevelBlocks.filter((block) => {
      try {
        return range.intersectsNode(block);
      } catch {
        return false;
      }
    });
  }

  function isListItemEffectivelyEmpty(listItem) {
    if (!listItem) return false;
    return !Array.from(listItem.childNodes).some(isNodeMeaningful);
  }

  function ensureListItemPlaceholder(listItem) {
    if (!listItem || !isListItemEffectivelyEmpty(listItem)) return;
    listItem.innerHTML = "<br>";
  }

  function placeCaretInNode(node, offset = 0) {
    if (typeof document === "undefined" || typeof window === "undefined" || !node) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);

    if (node.nodeType === Node.TEXT_NODE) {
      range.setStart(node, Math.min(offset, node.textContent?.length || 0));
    } else {
      range.collapse(offset <= 0);
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function placeCaretAtListItemStart(listItem) {
    if (!listItem) return;
    const firstTextNode = document.createTreeWalker(listItem, NodeFilter.SHOW_TEXT).nextNode();
    if (firstTextNode) {
      placeCaretInNode(firstTextNode, 0);
      return;
    }
    placeCaretInNode(listItem, 0);
  }

  function placeCaretAtListItemEnd(listItem) {
    if (!listItem) return;
    const walker = document.createTreeWalker(listItem, NodeFilter.SHOW_TEXT);
    let lastTextNode = null;
    while (walker.nextNode()) {
      lastTextNode = walker.currentNode;
    }
    if (lastTextNode) {
      placeCaretInNode(lastTextNode, lastTextNode.textContent?.length || 0);
      return;
    }
    placeCaretInNode(listItem, 1);
  }

  function isCaretAtListItemStart(listItem) {
    const range = getSelectionRangeWithinEditor();
    if (!range?.collapsed || !listItem) return false;
    const probeRange = document.createRange();
    probeRange.selectNodeContents(listItem);
    probeRange.setEnd(range.startContainer, range.startOffset);
    const fragment = probeRange.cloneContents();
    return !Array.from(fragment.childNodes).some(isNodeMeaningful);
  }

  function createBlocksFromListItem(listItem) {
    const inlineParagraph = document.createElement("p");
    const blocks = [];
    const nestedLists = [];
    const directBlockElements = Array.from(listItem.children).filter((child) => {
      const tag = child.tagName?.toLowerCase();
      return tag && TOP_LEVEL_BLOCK_TAGS.has(tag) && tag !== "ol" && tag !== "ul";
    });

    if (directBlockElements.length) {
      directBlockElements.forEach((block) => blocks.push(block));
      return { blocks, nestedLists };
    }

    Array.from(listItem.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE && ["ol", "ul"].includes(child.tagName.toLowerCase())) {
        nestedLists.push(child);
        return;
      }
      inlineParagraph.appendChild(child);
    });

    if (!isNodeMeaningful(inlineParagraph)) {
      inlineParagraph.innerHTML = "<br>";
    }

    blocks.push(inlineParagraph);
    return { blocks, nestedLists };
  }

  function removeEmptyCurrentOrderedListItem() {
    const currentListItem = getCurrentListItem();
    const currentList = getCurrentOrderedList();
    if (!currentListItem || !currentList || !isListItemEffectivelyEmpty(currentListItem)) return false;

    const nextListItem = currentListItem.nextElementSibling?.tagName?.toLowerCase() === "li" ? currentListItem.nextElementSibling : null;
    const previousListItem = currentListItem.previousElementSibling?.tagName?.toLowerCase() === "li" ? currentListItem.previousElementSibling : null;

    currentListItem.remove();

    if (!getDirectListItemCount(currentList)) {
      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      currentList.parentNode?.insertBefore(paragraph, currentList.nextSibling);
      currentList.remove();
      placeCaretInNode(paragraph, 0);
    } else if (nextListItem) {
      placeCaretAtListItemStart(nextListItem);
    } else if (previousListItem) {
      placeCaretAtListItemEnd(previousListItem);
    }

    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
    return true;
  }

  function getOrderedListStart(list) {
    if (!list) return 1;
    return list.hasAttribute("start") ? Math.max(1, Number(list.getAttribute("start")) || 1) : 1;
  }

  function runCommand(command, value = null) {
    refreshSelectionSnapshot();
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
  }

  function formatBlock(tag) {
    runCommand("formatBlock", tag);
  }

  function findPreviousTopLevelOrderedList(currentList) {
    const currentBlock = getTopLevelEditorBlock(currentList);
    if (!editorRef.current || !currentBlock) return null;
    const blocks = Array.from(editorRef.current.children).filter((child) =>
      TOP_LEVEL_BLOCK_TAGS.has(child.tagName?.toLowerCase())
    );
    const currentIndex = blocks.indexOf(currentBlock);
    if (currentIndex <= 0) return null;

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      if (blocks[index].tagName?.toLowerCase() === "ol") {
        return blocks[index];
      }
    }

    return null;
  }

  function buildOrderedListFromBlocks(blocks, start = 1) {
    if (!blocks.length) return null;
    const orderedList = document.createElement("ol");
    if (start > 1) {
      orderedList.setAttribute("start", String(start));
    }

    blocks[0].parentNode?.insertBefore(orderedList, blocks[0]);

    blocks.forEach((block) => {
      const listItem = document.createElement("li");
      listItem.appendChild(block);
      ensureListItemPlaceholder(listItem);
      orderedList.appendChild(listItem);
    });

    return orderedList;
  }

  function convertListTag(list, tagName) {
    if (!list || list.tagName?.toLowerCase() === tagName) return list;
    const replacement = document.createElement(tagName);
    while (list.firstChild) {
      replacement.appendChild(list.firstChild);
    }
    list.parentNode?.replaceChild(replacement, list);
    return replacement;
  }

  function convertOrderedListToParagraphs(list) {
    if (!list) return;
    const parent = list.parentNode;
    const listItems = Array.from(list.children).filter((child) => child.tagName?.toLowerCase() === "li");
    let firstOutputBlock = null;

    listItems.forEach((listItem) => {
      const { blocks, nestedLists } = createBlocksFromListItem(listItem);
      blocks.forEach((block) => {
        if (!firstOutputBlock) firstOutputBlock = block;
        parent?.insertBefore(block, list);
      });
      nestedLists.forEach((nestedList) => parent?.insertBefore(nestedList, list));
    });

    list.remove();
    if (firstOutputBlock) {
      placeCaretInNode(firstOutputBlock, 0);
    }
  }

  function createOrderedList() {
    refreshSelectionSnapshot();
    restoreSelection();
    editorRef.current?.focus();

    const currentList = getCurrentList();
    if (currentList?.tagName?.toLowerCase() === "ol") {
      convertOrderedListToParagraphs(currentList);
      syncEditorMarkdown();
      rememberSelection();
      window.setTimeout(refreshEditorState, 0);
      return;
    }

    if (currentList?.tagName?.toLowerCase() === "ul") {
      const orderedList = convertListTag(currentList, "ol");
      orderedList?.removeAttribute("start");
      syncEditorMarkdown();
      rememberSelection();
      window.setTimeout(refreshEditorState, 0);
      return;
    }

    const range = getSelectionRangeWithinEditor();
    if (!range || range.collapsed) return;

    const selectedBlocks = getSelectedTopLevelBlocks().filter(Boolean);
    if (!selectedBlocks.length) return;

    const orderedList = buildOrderedListFromBlocks(selectedBlocks, 1);
    const firstListItem = orderedList?.querySelector("li");
    if (firstListItem) {
      placeCaretAtListItemStart(firstListItem);
    }

    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
  }

  function continueCurrentOrderedListNumbering() {
    refreshSelectionSnapshot();
    restoreSelection();
    editorRef.current?.focus();
    const currentList = getCurrentOrderedList();
    if (!currentList) return;

    const previousList = findPreviousTopLevelOrderedList(currentList);
    if (!previousList) return;

    const nextStart = getOrderedListStart(previousList) + getDirectListItemCount(previousList);
    currentList.setAttribute("start", String(nextStart));
    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
  }

  function restartCurrentOrderedListNumbering() {
    refreshSelectionSnapshot();
    restoreSelection();
    editorRef.current?.focus();
    const currentList = getCurrentOrderedList();
    if (!currentList) return;
    currentList.removeAttribute("start");
    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
  }

  function insertSoftLineBreak() {
    const range = getSelectionRangeWithinEditor();
    if (!range) return;
    range.deleteContents();
    const br = document.createElement("br");
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
  }

  function splitCurrentOrderedListItem() {
    const currentListItem = getCurrentListItem();
    const range = getSelectionRangeWithinEditor();
    if (!currentListItem || !range) return false;

    if (!range.collapsed) {
      range.deleteContents();
    }

    const splitRange = document.createRange();
    splitRange.selectNodeContents(currentListItem);
    splitRange.setStart(range.startContainer, range.startOffset);
    const trailingContent = splitRange.extractContents();

    const nextListItem = document.createElement("li");
    if (trailingContent.childNodes.length) {
      nextListItem.appendChild(trailingContent);
    }

    ensureListItemPlaceholder(currentListItem);
    ensureListItemPlaceholder(nextListItem);

    currentListItem.parentNode?.insertBefore(nextListItem, currentListItem.nextSibling);
    placeCaretAtListItemStart(nextListItem);
    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
    return true;
  }

  function exitCurrentOrderedListItem() {
    const currentList = getCurrentOrderedList();
    const currentListItem = getCurrentListItem();
    if (!currentList || !currentListItem) return false;

    const listItems = Array.from(currentList.children).filter((child) => child.tagName?.toLowerCase() === "li");
    const currentIndex = listItems.indexOf(currentListItem);
    if (currentIndex === -1) return false;

    const followingItems = listItems.slice(currentIndex + 1);
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br>";

    let trailingList = null;
    if (followingItems.length) {
      trailingList = document.createElement("ol");
      const trailingStart = getOrderedListStart(currentList) + currentIndex;
      if (trailingStart > 1) {
        trailingList.setAttribute("start", String(trailingStart));
      }
      followingItems.forEach((item) => trailingList.appendChild(item));
    }

    const parent = currentList.parentNode;
    const hasLeadingItems = currentIndex > 0;

    currentListItem.remove();

    if (hasLeadingItems) {
      parent?.insertBefore(paragraph, currentList.nextSibling);
    } else {
      parent?.insertBefore(paragraph, currentList);
    }

    if (trailingList) {
      parent?.insertBefore(trailingList, paragraph.nextSibling);
    }

    if (!getDirectListItemCount(currentList)) {
      currentList.remove();
    }

    placeCaretInNode(paragraph, 0);
    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
    return true;
  }

  function liftCurrentOrderedListItemToParagraph() {
    const currentList = getCurrentOrderedList();
    const currentListItem = getCurrentListItem();
    if (!currentList || !currentListItem) return false;

    const listItems = Array.from(currentList.children).filter((child) => child.tagName?.toLowerCase() === "li");
    const currentIndex = listItems.indexOf(currentListItem);
    if (currentIndex === -1) return false;

    const followingItems = listItems.slice(currentIndex + 1);
    const { blocks, nestedLists } = createBlocksFromListItem(currentListItem);
    let trailingList = null;

    if (followingItems.length) {
      trailingList = document.createElement("ol");
      const trailingStart = getOrderedListStart(currentList) + currentIndex;
      if (trailingStart > 1) {
        trailingList.setAttribute("start", String(trailingStart));
      }
      followingItems.forEach((item) => trailingList.appendChild(item));
    }

    const parent = currentList.parentNode;
    const hasLeadingItems = currentIndex > 0;
    currentListItem.remove();

    let insertAfterNode = hasLeadingItems ? currentList : currentList.previousSibling;

    if (hasLeadingItems) {
      blocks.forEach((block) => {
        parent?.insertBefore(block, insertAfterNode.nextSibling);
        insertAfterNode = block;
      });
    } else {
      blocks.forEach((block) => {
        parent?.insertBefore(block, currentList);
        insertAfterNode = block;
      });
    }
    nestedLists.forEach((nestedList) => {
      parent?.insertBefore(nestedList, insertAfterNode.nextSibling);
      insertAfterNode = nestedList;
    });

    if (trailingList) {
      parent?.insertBefore(trailingList, insertAfterNode.nextSibling);
    }

    if (!getDirectListItemCount(currentList)) {
      currentList.remove();
    }

    placeCaretInNode(blocks[0], 0);
    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
    return true;
  }

  function toggleOrderedList() {
    createOrderedList();
  }

  function openInsertDialog(type) {
    refreshSelectionSnapshot();
    const selectedText = window.getSelection()?.toString() || "";
    setInsertDialog({
      open: true,
      type,
      url: "",
      label: type === "link" ? selectedText : "",
      alt: type === "image" ? selectedText || "Blog image" : "",
      error: "",
    });
  }

  function insertLink() {
    openInsertDialog("link");
  }

  function insertImage() {
    openInsertDialog("image");
  }

  function insertVideo() {
    openInsertDialog("video");
  }

  function closeInsertDialog() {
    setInsertDialog((current) => ({ ...current, open: false, error: "" }));
    window.setTimeout(() => {
      restoreSelection();
      editorRef.current?.focus();
    }, 0);
  }

  function submitInsertDialog() {
    const url = insertDialog.url.trim();
    if (!url) {
      setInsertDialog((current) => ({ ...current, error: "URL is required." }));
      return;
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("URL must start with http:// or https://.");
      }
    } catch (error) {
      setInsertDialog((current) => ({ ...current, error: error.message || "Enter a valid URL." }));
      return;
    }

    if (insertDialog.type === "link") {
      restoreSelection();
      if (window.getSelection()?.isCollapsed && insertDialog.label.trim()) {
        insertHtml(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(insertDialog.label.trim())}</a>`);
      } else {
        runCommand("createLink", url);
      }
    }

    if (insertDialog.type === "image") {
      const alt = insertDialog.alt.trim() || "Blog image";
      insertHtml(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="my-4 max-h-80 rounded-2xl border border-slate-200 object-cover" />`);
    }

    if (insertDialog.type === "video") {
      const embedUrl = resolveVideoEmbedUrl(url);
      if (!embedUrl) {
        setInsertDialog((current) => ({ ...current, error: "Only YouTube and Vimeo URLs are supported." }));
        return;
      }
      insertHtml(
        `<div class="my-5 aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><iframe src="${embedUrl}" data-video-source="${escapeHtml(url)}" title="Video embed" class="h-full w-full" allowfullscreen loading="lazy"></iframe></div><p><br></p>`
      );
    }

    setInsertDialog((current) => ({ ...current, open: false, error: "" }));
  }

  function insertHtml(html) {
    refreshSelectionSnapshot();
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
  }

  function insertRedCardToken() {
    const now = Date.now();
    if (now - lastRedCardInsertAtRef.current < 500) return;
    lastRedCardInsertAtRef.current = now;

    refreshSelectionSnapshot();
    restoreSelection();
    editorRef.current?.focus();
    const inserted = document.execCommand("insertText", false, RED_CARD_TOKEN);
    if (!inserted) {
      insertHtml(escapeHtml(RED_CARD_TOKEN));
      return;
    }

    syncEditorMarkdown();
    rememberSelection();
    window.setTimeout(refreshEditorState, 0);
  }

  function wrapSelectionWithElement(tagName, styles = {}) {
    refreshSelectionSnapshot();
    restoreSelection();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return;

    const wrapper = document.createElement(tagName);
    Object.assign(wrapper.style, styles);

    if (range.collapsed) {
      editorRef.current?.focus();
      return;
    }

    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.removeAllRanges();
    selection.addRange(nextRange);

    rememberSelection();
    syncEditorMarkdown();
    window.setTimeout(refreshEditorState, 0);
  }

  function applyInlineStyle(styleName, value) {
    refreshSelectionSnapshot();
    restoreSelection();
    const selection = window.getSelection();
    if (selection?.isCollapsed) return;
    wrapSelectionWithElement("span", { [styleName]: value });
  }

  function applyColor(colorOverride = toolbar.color) {
    applyInlineStyle("color", colorOverride);
  }

  function applyFontSize(sizeOverride = toolbar.fontSize) {
    const fontSize = Math.max(8, Math.min(72, Number(sizeOverride) || 16));
    applyInlineStyle("fontSize", `${fontSize}px`);
  }

  function applyFontSizeValue(value, closeMenu = true) {
    const nextSize = String(Math.max(8, Math.min(72, Number(value) || 16)));
    setToolbar((current) => ({ ...current, fontSize: nextSize }));
    window.setTimeout(() => applyFontSize(nextSize), 0);
    if (closeMenu) setSizeMenuOpen(false);
    setSizeCustomEditing(false);
  }

  function applyHighlight() {
    refreshSelectionSnapshot();
    restoreSelection();
    const selection = window.getSelection();
    if (selection?.isCollapsed) return;
    const anchorNode = selection?.anchorNode || null;
    const mark = closestElement(anchorNode, "mark", editorRef.current);
    if (mark) {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      syncEditorMarkdown();
      window.setTimeout(refreshEditorState, 0);
      return;
    }
    wrapSelectionWithElement("mark");
  }

  function clearInlineFormatting() {
    runCommand("removeFormat");
  }

  function handleEditorShortcut(event) {
    const currentOrderedList = getCurrentOrderedList();
    const currentListItem = getCurrentListItem();
    const selection = typeof window !== "undefined" ? window.getSelection() : null;

    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      selection?.isCollapsed &&
      currentOrderedList &&
      currentListItem &&
      isListItemEffectivelyEmpty(currentListItem)
    ) {
      event.preventDefault();
      removeEmptyCurrentOrderedListItem();
      return;
    }

    if (
      event.key === "Backspace" &&
      selection?.isCollapsed &&
      currentOrderedList &&
      currentListItem &&
      isCaretAtListItemStart(currentListItem)
    ) {
      event.preventDefault();
      liftCurrentOrderedListItemToParagraph();
      return;
    }

    if (event.key === "Enter" && currentOrderedList && currentListItem) {
      event.preventDefault();
      if (event.shiftKey) {
        insertSoftLineBreak();
        return;
      }

      if (selection && !selection.isCollapsed) {
        selection.deleteFromDocument();
      }

      if (isListItemEffectivelyEmpty(currentListItem)) {
        exitCurrentOrderedListItem();
        return;
      }

      splitCurrentOrderedListItem();
      return;
    }

    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      runCommand("bold");
    }
    if (key === "i") {
      event.preventDefault();
      runCommand("italic");
    }
    if (key === "u") {
      event.preventDefault();
      runCommand("underline");
    }
    if (key === "k") {
      event.preventDefault();
      openInsertDialog("link");
    }
    if (event.altKey && ["2", "3", "4"].includes(key)) {
      event.preventDefault();
      formatBlock(`h${key}`);
    }
  }

  function focusPublishErrorField(field) {
    if (field === "content" || field === "headings" || field === "paragraphs") {
      editorRef.current?.focus();
      return;
    }

    const fieldNameByIssue = {
      title: "title",
      slug: "slug",
      excerpt: "excerpt",
      seoTitle: "seo_title",
      seoDescription: "seo_description",
    };
    const fieldName = fieldNameByIssue[field];
    if (!fieldName) return;
    document.querySelector(`[name="${fieldName}"]`)?.focus();
  }

  function handleSubmitCapture(event) {
    const markdown = syncEditorMarkdown({ commitState: true });
    if (form.status !== "published") {
      setClientPublishErrors([]);
      return;
    }

    const publishAnalysis = analyzeBlogEditorContent({ ...form, contentMarkdown: markdown });
    if (!publishAnalysis.readyToPublish) {
      event.preventDefault();
      setClientPublishErrors(publishAnalysis.hardErrors);
      focusPublishErrorField(publishAnalysis.hardErrors[0]?.field);
    }
  }

  return (
    <form action={formAction} onSubmitCapture={handleSubmitCapture} className="space-y-5">
      <input type="hidden" name="id" value={post?.id || ""} />

      <div className="space-y-4 rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_16px_32px_rgba(15,23,42,0.05)]">
        {state?.error ? (
          <div className="whitespace-pre-line rounded-2xl border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[#b91c1c]">
            {state.error}
          </div>
        ) : null}

        {clientPublishErrors.length ? (
          <div className="rounded-2xl border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[#b91c1c]">
            <p className="font-semibold">Publish blocked. Fix these first:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {clientPublishErrors.map((error) => (
                <li key={`${error.field}-${error.message}`}>{error.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <input
              name="title"
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
            />
            <MetricFeedback metric={metrics.title} />
          </Field>
          <Field label="Slug">
            <input
              name="slug"
              value={form.slug}
              onChange={(event) => {
                setSlugEdited(true);
                updateField("slug", normalizeEditableSlug(event.target.value));
              }}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
            />
            <MetricFeedback metric={metrics.slug} unit="words">
              <p className="mt-1 font-mono text-[11px] text-[#475569]">/blog/{metrics.slug.slug || "your-slug"}</p>
              <p className="mt-1 text-[#94a3b8]">Auto-generated from title until you edit it.</p>
            </MetricFeedback>
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Category">
            <select
              name="category_id"
              value={form.categoryId}
              onChange={(event) => updateField("categoryId", event.target.value)}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              name="status"
              value={form.status}
              onChange={(event) => updateField("status", event.target.value)}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
            </select>
          </Field>
        </div>

        {form.status === "unpublished" || post?.image_check_error ? (
          <div className="rounded-2xl border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[#b91c1c]">
            <p className="font-semibold">This post is not visible publicly.</p>
            <p className="mt-1">
              {post?.image_check_error ||
                form.unpublishedReason ||
                "Review the post content, update any broken image URLs, then publish again."}
            </p>
            <input type="hidden" name="unpublished_reason" value={form.unpublishedReason} />
            <input type="hidden" name="image_check_status" value={post?.image_check_status || ""} />
            <input type="hidden" name="image_check_error" value={post?.image_check_error || ""} />
            <input type="hidden" name="image_checked_at" value={post?.image_checked_at || ""} />
          </div>
        ) : null}

        <Field label="Published at" helper="If status is published and this is empty, the server fills it with the current time.">
          <input
            type="datetime-local"
            name="published_at"
            value={form.publishedAt}
            onChange={(event) => updateField("publishedAt", event.target.value)}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
          />
        </Field>

        <Field label="Excerpt">
          <textarea
            name="excerpt"
            rows={3}
            maxLength={170}
            value={form.excerpt}
            onChange={(event) => updateField("excerpt", event.target.value)}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
          />
          <MetricFeedback metric={metrics.excerpt}>
            {metrics.excerpt.count > 160 ? (
              <p className="mt-1 text-[#92400e]">If reused as a meta description, 160 characters is the safer max.</p>
            ) : null}
          </MetricFeedback>
        </Field>

        <Field label="Cover image URL" helper="URL-only for now. External image URLs and R2 public URLs are supported.">
          <input
            type="url"
            name="cover_image_url"
            value={form.coverImageUrl}
            onChange={(event) => updateField("coverImageUrl", event.target.value)}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
          />
        </Field>

        <div className="block space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">Article content</p>
            <p className="mt-1 text-xs leading-5 text-[#94a3b8]">
              Edit visually. The system saves clean Markdown behind the scenes.
            </p>
          </div>
          <MetricFeedback metric={metrics.body} unit="words">
            <div className="mt-1 flex flex-wrap gap-2 text-[#64748b]">
              <span>{metrics.body.headingCount} H2/H3/H4 headings</span>
              <span>Longest paragraph: {metrics.body.longestParagraphWords} words</span>
            </div>
          </MetricFeedback>
          <input ref={hiddenMarkdownRef} type="hidden" name="content_markdown" defaultValue={form.contentMarkdown} />
          <div className="overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-1 border-b border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-3 py-2">
              <ToolbarButton title="Undo" onClick={() => runCommand("undo")}>↶</ToolbarButton>
              <ToolbarButton title="Redo" onClick={() => runCommand("redo")}>↷</ToolbarButton>
              <span className="mx-1 h-6 w-px bg-[rgba(15,23,42,0.12)]" />
              <select
                value={toolbar.block}
                onChange={(event) => formatBlock(event.target.value)}
                className="h-9 rounded-md border-0 bg-transparent px-2 text-sm font-medium text-[#374151] outline-none hover:bg-[#eef2f7]"
              >
                <option value="p">Paragraph text</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
                <option value="h4">Heading 4</option>
              </select>
              <div className="relative" data-size-menu>
                {sizeCustomEditing ? (
                  <label className="inline-flex h-9 min-w-[88px] items-center gap-1 rounded-lg border border-[#103474]/35 bg-white px-2 text-sm font-semibold text-[#111827] shadow-sm">
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      value={toolbar.fontSize}
                      onMouseDown={rememberSelection}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => {
                        const nextValue = event.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                        setToolbar((current) => ({ ...current, fontSize: nextValue }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyFontSizeValue(event.currentTarget.value);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setSizeCustomEditing(false);
                        }
                      }}
                      onBlur={(event) => applyFontSizeValue(event.currentTarget.value)}
                      className="h-7 w-10 bg-transparent text-right font-bold outline-none"
                      aria-label="Custom font size in pixels"
                    />
                    <span className="text-xs font-semibold text-[#94a3b8]">px</span>
                  </label>
                ) : (
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      rememberSelection();
                    }}
                    onClick={() => setSizeMenuOpen((current) => !current)}
                    onDoubleClick={() => {
                      rememberSelection();
                      setSizeMenuOpen(false);
                      setSizeCustomEditing(true);
                    }}
                    className="inline-flex h-9 min-w-[88px] items-center justify-between gap-2 rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-3 text-sm font-semibold text-[#111827] shadow-sm transition hover:border-[#103474]/35 hover:bg-[#f8fbff]"
                    aria-expanded={sizeMenuOpen}
                    aria-haspopup="menu"
                    title="Click for presets. Double-click to type a custom size."
                  >
                    <span>{toolbar.fontSize || "16"} px</span>
                    <span className="text-[10px] text-[#64748b]">v</span>
                  </button>
                )}
                {sizeMenuOpen ? (
                  <div className="absolute left-0 top-11 z-30 w-24 rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
                    <div className="flex flex-col gap-1">
                      {FONT_SIZE_OPTIONS.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            rememberSelection();
                            applyFontSizeValue(size);
                          }}
                          className={`h-8 w-full rounded-xl px-2.5 text-sm font-semibold transition ${
                            String(size) === String(toolbar.fontSize)
                              ? "bg-[#103474] text-white"
                              : "text-[#334155] hover:bg-[#eef3ff] hover:text-[#103474]"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <ToolbarButton title="Decrease text size" onClick={() => setToolbar((current) => ({ ...current, fontSize: String(Math.max(12, Number(current.fontSize) - 2)) }))}>−</ToolbarButton>
              <ToolbarButton title="Apply text size" onClick={applyFontSize}>{toolbar.fontSize}</ToolbarButton>
              <ToolbarButton title="Increase text size" onClick={() => setToolbar((current) => ({ ...current, fontSize: String(Math.min(48, Number(current.fontSize) + 2)) }))}>＋</ToolbarButton>
              <span className="mx-1 h-6 w-px bg-[rgba(15,23,42,0.12)]" />
              <ToolbarButton active={activeFormats.bold} title="Bold (Ctrl+B)" onClick={() => runCommand("bold")}>
                <span className="font-black">B</span>
              </ToolbarButton>
              <ToolbarButton active={activeFormats.italic} title="Italic (Ctrl+I)" onClick={() => runCommand("italic")}>
                <span className="italic">I</span>
              </ToolbarButton>
              <ToolbarButton active={activeFormats.underline} title="Underline (Ctrl+U)" onClick={() => runCommand("underline")}>
                <span className="underline">U</span>
              </ToolbarButton>
              <ToolbarButton active={activeFormats.strike} title="Strikethrough" onClick={() => runCommand("strikeThrough")}>
                <span className="line-through">S</span>
              </ToolbarButton>
              <ToolbarButton title="Highlight" onClick={applyHighlight}>▰</ToolbarButton>
              <ToolbarButton active={activeFormats.highlight} title="Toggle highlight" onClick={applyHighlight}>HL</ToolbarButton>
              <label className="relative inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md text-sm font-semibold text-[#4b5563] hover:bg-[#f3f4f6]">
                <span className="underline decoration-2">A</span>
                <input
                  type="color"
                  value={toolbar.color}
                  onMouseDown={rememberSelection}
                  onChange={(event) => {
                    const nextColor = event.target.value;
                    setToolbar((current) => ({ ...current, color: nextColor }));
                    window.setTimeout(() => applyColor(nextColor), 0);
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Text color"
                />
              </label>
              <span className="mx-1 h-6 w-px bg-[rgba(15,23,42,0.12)]" />
              <ToolbarButton title="Bulleted list" onClick={() => runCommand("insertUnorderedList")}>• list</ToolbarButton>
              <ToolbarButton active={activeFormats.orderedList} title="Numbered list" onClick={toggleOrderedList}>1. list</ToolbarButton>
              <ToolbarButton title="Continuar numeración" onClick={continueCurrentOrderedListNumbering}>Continue</ToolbarButton>
              <ToolbarButton title="Reiniciar numeración" onClick={restartCurrentOrderedListNumbering}>Restart</ToolbarButton>
              <ToolbarButton title="Quote" onClick={() => formatBlock("blockquote")}>❝</ToolbarButton>
              <ToolbarButton title="Align left" onClick={() => runCommand("justifyLeft")}>≡</ToolbarButton>
              <ToolbarButton title="Align center" onClick={() => runCommand("justifyCenter")}>≣</ToolbarButton>
              <ToolbarButton title="Align right" onClick={() => runCommand("justifyRight")}>≡</ToolbarButton>
              <span className="mx-1 h-6 w-px bg-[rgba(15,23,42,0.12)]" />
              <ToolbarButton title="Insert link (Ctrl+K)" onClick={insertLink}>🔗</ToolbarButton>
              <ToolbarButton title="Insert image URL" onClick={insertImage}>▧</ToolbarButton>
              <ToolbarButton title="Insert video" onClick={insertVideo}>▶</ToolbarButton>
              <ToolbarButton title="Divider" onClick={() => insertHtml("<hr /><p><br></p>")}>―</ToolbarButton>
              <ToolbarButton title="Add link" onClick={() => openInsertDialog("link")}>Link</ToolbarButton>
              <ToolbarButton title="Add image" onClick={() => openInsertDialog("image")}>Image</ToolbarButton>
              <ToolbarButton title="Add video" onClick={() => openInsertDialog("video")}>Video</ToolbarButton>
              <ToolbarButton title="Add divider" onClick={() => insertHtml("<hr /><p><br></p>")}>Line</ToolbarButton>
              <ToolbarButton title="Insertar Red Card" onClick={insertRedCardToken}>Insertar Red Card</ToolbarButton>
              <ToolbarButton title="Clear formatting" onClick={clearInlineFormatting}>Tx</ToolbarButton>
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Article content editor"
              onInput={syncEditorMarkdown}
              onBlur={() => syncEditorMarkdown({ commitState: true })}
              onFocus={() => {
                refreshSelectionSnapshot();
                refreshEditorState();
              }}
              onKeyDown={handleEditorShortcut}
              onKeyUp={() => {
                refreshSelectionSnapshot();
                refreshEditorState();
              }}
              onMouseUp={() => {
                refreshSelectionSnapshot();
                refreshEditorState();
              }}
              className="prose prose-slate h-[70vh] max-h-[70vh] min-h-[70vh] max-w-none overflow-y-auto bg-white px-8 py-7 text-base leading-7 text-[#111827] outline-none focus:ring-2 focus:ring-inset focus:ring-[#103474]/25 [&_blockquote]:border-l-4 [&_blockquote]:border-[#103474] [&_blockquote]:bg-[#eef3ff] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:text-xl [&_h3]:font-bold [&_h4]:text-lg [&_h4]:font-bold [&_img]:my-4 [&_img]:max-h-80 [&_img]:rounded-2xl [&_img]:border [&_img]:border-slate-200 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
            />
            <div className="flex flex-wrap gap-2 border-t border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-3 py-2 text-[11px] text-[#64748b]">
              <span>Shortcuts:</span>
              <span>Ctrl+B</span>
              <span>Ctrl+I</span>
              <span>Ctrl+U</span>
              <span>Ctrl+K</span>
              <span>Ctrl+Alt+2/3/4</span>
              <span>Insertar Red Card adds {RED_CARD_TOKEN} for the frontend promo card.</span>
            </div>
          </div>
        </div>

        {insertDialog.open ? (
          <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-[rgba(15,23,42,0.38)] px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                  {insertDialog.type === "image" ? "Insert image" : insertDialog.type === "video" ? "Insert video" : "Insert link"}
                </p>
                <h3 className="mt-1 text-lg font-bold text-[#111827]">
                  {insertDialog.type === "image"
                    ? "Add an external image URL"
                    : insertDialog.type === "video"
                      ? "Embed a YouTube or Vimeo video"
                      : "Add a link to selected text"}
                </h3>
              </div>

              <div className="space-y-3">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">URL</span>
                  <input
                    autoFocus
                    type="url"
                    value={insertDialog.url}
                    onChange={(event) => setInsertDialog((current) => ({ ...current, url: event.target.value, error: "" }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitInsertDialog();
                      }
                    }}
                    className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
                    placeholder={
                      insertDialog.type === "video"
                        ? "https://www.youtube.com/watch?v=..."
                        : "https://example.com/resource"
                    }
                  />
                </label>

                {insertDialog.type === "link" ? (
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Text if nothing is selected</span>
                    <input
                      value={insertDialog.label}
                      onChange={(event) => setInsertDialog((current) => ({ ...current, label: event.target.value }))}
                      className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
                      placeholder="Link text"
                    />
                  </label>
                ) : null}

                {insertDialog.type === "image" ? (
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Alt text</span>
                    <input
                      value={insertDialog.alt}
                      onChange={(event) => setInsertDialog((current) => ({ ...current, alt: event.target.value }))}
                      className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
                      placeholder="Describe the image"
                    />
                  </label>
                ) : null}

                {insertDialog.error ? (
                  <p className="rounded-2xl border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[#b91c1c]">
                    {insertDialog.error}
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeInsertDialog}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitInsertDialog}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
                >
                  Insert
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="SEO title">
            <input
              name="seo_title"
              value={form.seoTitle}
              onChange={(event) => updateField("seoTitle", event.target.value)}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
            />
            <MetricFeedback metric={metrics.seoTitle}>
              <p className="mt-1 text-[#64748b]">Mobile search results are tighter, so front-load important words.</p>
            </MetricFeedback>
          </Field>
          <Field label="SEO description">
            <textarea
              name="seo_description"
              rows={3}
              value={form.seoDescription}
              onChange={(event) => updateField("seoDescription", event.target.value)}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#103474]"
            />
            <MetricFeedback metric={metrics.seoDescription} />
          </Field>
        </div>

        <BlogQualityPanel analysis={editorAnalysis} />

        <div className="flex flex-wrap justify-end gap-2">
          <button
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#103474] px-5 text-sm font-semibold text-white transition hover:bg-[#0c295a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save post"}
          </button>
        </div>
      </div>

    </form>
  );
}
