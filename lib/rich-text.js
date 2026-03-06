const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "br", "p", "ul", "ol", "li", "div"]);

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBlockTags(value) {
  return String(value || "")
    .replace(/<div>\s*<br\s*\/?>\s*<\/div>/gi, "<br>")
    .replace(/<div>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>");
}

export function sanitizeRichTextHtml(value) {
  const raw = normalizeBlockTags(String(value || ""));
  const withoutScripts = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  return withoutScripts.replace(/<\/?([a-z0-9-]+)(?:\s[^>]*)?>/gi, (full, tagName) => {
    const normalized = String(tagName || "").toLowerCase();
    if (!ALLOWED_TAGS.has(normalized)) return "";
    return full.startsWith("</") ? `</${normalized}>` : `<${normalized}>`;
  });
}

export function markdownToBasicHtml(value) {
  const escaped = escapeHtml(String(value || ""));
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\r?\n/g, "<br>");
}

export function toRichTextHtml(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
  if (looksLikeHtml) return sanitizeRichTextHtml(raw);
  return sanitizeRichTextHtml(markdownToBasicHtml(raw));
}

