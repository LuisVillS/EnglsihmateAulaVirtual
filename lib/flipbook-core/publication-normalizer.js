import { load } from "cheerio";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { cleanText, normalizeWhitespace, toAsciiSlug } from "../library/normalization.js";
import { splitLibraryTtsSentences } from "../library/tts.js";

const SKIPPED_SECTION_TYPES = new Set(["cover", "titlepage", "imprint"]);
const BLOCK_TAGS = new Set(["p", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6"]);

function normalizePath(path = "") {
  return cleanText(path).replace(/\\/g, "/").replace(/^\.\//, "");
}

function splitPath(path = "") {
  return normalizePath(path).split("/").filter(Boolean);
}

function dirname(path = "") {
  const parts = splitPath(path);
  parts.pop();
  return parts.join("/");
}

function joinPath(basePath = "", relativePath = "") {
  const relative = cleanText(relativePath);
  if (!relative) return normalizePath(basePath);
  if (/^[a-z]+:/i.test(relative)) return relative;
  const root = splitPath(basePath);
  const parts = relative.split("/");

  if (relative.startsWith("/")) {
    return normalizePath(relative.slice(1));
  }

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      root.pop();
      continue;
    }
    root.push(part);
  }

  return root.join("/");
}

function createArchiveMap(bytes) {
  const archive = unzipSync(new Uint8Array(bytes));
  const entries = new Map();
  Object.entries(archive).forEach(([key, value]) => {
    entries.set(normalizePath(key), value);
  });
  return entries;
}

function readArchiveText(entries, path = "") {
  const bytes = entries.get(normalizePath(path));
  if (!bytes) return "";
  return strFromU8(bytes);
}

function readArchiveBase64(entries, path = "") {
  const bytes = entries.get(normalizePath(path));
  if (!bytes) return "";
  return Buffer.from(bytes).toString("base64");
}

function resolveContainerOpfPath(entries) {
  const containerXml = readArchiveText(entries, "META-INF/container.xml");
  const $ = load(containerXml, { xmlMode: true });
  return normalizePath($("rootfile").first().attr("full-path") || "");
}

function mapManifestItems($package, opfDir = "") {
  const items = new Map();
  $package("manifest > item").each((_, element) => {
    const node = $package(element);
    const id = cleanText(node.attr("id"));
    if (!id) return;
    items.set(id, {
      id,
      href: normalizePath(joinPath(opfDir, node.attr("href") || "")),
      mediaType: cleanText(node.attr("media-type")),
      properties: cleanText(node.attr("properties")),
    });
  });
  return items;
}

function sanitizeInlineHtml(rawHtml = "") {
  return cleanText(rawHtml)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+='[^']*'/gi, "");
}

function normalizeTargetKey(basePath = "", href = "") {
  const [pathPart, hashPart = ""] = cleanText(href).split("#");
  const resolvedPath = normalizePath(pathPart ? joinPath(dirname(basePath), pathPart) : basePath);
  if (!resolvedPath) return "";
  return hashPart ? `${resolvedPath}#${hashPart}` : resolvedPath;
}

function inferSectionType({ href = "", properties = "", title = "" } = {}) {
  const fileName = href.split("/").pop() || "";
  const safeTitle = cleanText(title).toLowerCase();
  const safeProperties = cleanText(properties).toLowerCase();
  if (safeProperties.includes("cover-image") || /^cover(?:-image)?\./i.test(fileName)) return "cover";
  if (/titlepage/i.test(fileName) || safeTitle === "title page" || safeTitle === "titlepage") return "titlepage";
  if (/imprint/i.test(fileName) || safeTitle === "imprint") return "imprint";
  return "body";
}

function collectNodeAnchors($, element) {
  const anchors = new Set();
  const root = $(element);
  const rootId = cleanText(root.attr("id") || root.attr("name"));
  if (rootId) anchors.add(rootId);
  root.find("[id], [name]").each((_, child) => {
    const node = $(child);
    const id = cleanText(node.attr("id") || node.attr("name"));
    if (id) anchors.add(id);
  });
  return Array.from(anchors);
}

function buildTextSegmentId(sectionHref, blockIndex, chunkIndex = 0) {
  return `seg-${toAsciiSlug(sectionHref)}-${blockIndex}-${chunkIndex}`;
}

function estimateBlockUnits({ tagName = "p", text = "", hasImage = false } = {}) {
  if (hasImage) return 22;
  if (/^h[1-6]$/i.test(tagName)) return Math.max(12, Math.ceil(text.length / 34) + 12);
  if (tagName === "blockquote" || tagName === "pre") return Math.max(10, Math.ceil(text.length / 42) + 10);
  return Math.max(8, Math.ceil(text.length / 52) + 8);
}

function chunkText(text = "", maxLength = 420) {
  const sentences = splitLibraryTtsSentences(text);
  if (!sentences.length || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildBlockAttributeString({ tagName = "p", blockId = "", anchors = [] } = {}) {
  const dataAnchorAttr = anchors.length ? ` data-anchors="${anchors.join("|")}"` : "";
  return `class="flipbook-block flipbook-block-${tagName}" data-block-id="${blockId}"${dataAnchorAttr}`;
}

function applyBlockAttributesToRootHtml({ html = "", tagName = "p", blockId = "", anchors = [] } = {}) {
  const safeHtml = cleanText(html);
  if (!safeHtml) return "";

  const $ = load(`<root>${safeHtml}</root>`, { xmlMode: false, decodeEntities: false });
  const root = $("root").children().first();
  if (!root.length) return "";

  const currentClassName = cleanText(root.attr("class"));
  const nextClassName = [currentClassName, "flipbook-block", `flipbook-block-${tagName}`].filter(Boolean).join(" ");
  root.attr("class", nextClassName);
  root.attr("data-block-id", blockId);
  if (anchors.length) {
    root.attr("data-anchors", anchors.join("|"));
  } else {
    root.removeAttr("data-anchors");
  }
  return $.html(root);
}

function createTextBlocksForElement($, element, sectionHref, blockIndexStart = 0, chapterId = "") {
  const node = $(element);
  const tagName = (node[0]?.tagName || "p").toLowerCase();
  const anchors = collectNodeAnchors($, element);
  const text = normalizeWhitespace(node.text());
  if (!text) return [];

  const rawHtml = sanitizeInlineHtml($.html(element));
  const chunks = chunkText(text);
  return chunks.map((chunk, index) => {
    const blockIndex = blockIndexStart + index;
    const segmentId = buildTextSegmentId(sectionHref, blockIndex, index);
    const chunkHtml =
      chunks.length === 1
        ? rawHtml
        : `<${tagName}>${chunk.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</${tagName}>`;

    return {
      id: `${toAsciiSlug(sectionHref)}-${blockIndex}`,
      tagName,
      html:
        chunks.length === 1
          ? applyBlockAttributesToRootHtml({
              html: chunkHtml,
              tagName,
              blockId: segmentId,
              anchors: index === 0 ? anchors : [],
            })
          : `<${tagName} ${buildBlockAttributeString({
              tagName,
              blockId: segmentId,
              anchors: index === 0 ? anchors : [],
            })}>${chunk
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</${tagName}>`,
      text: chunk,
      anchors: index === 0 ? anchors : [],
      sectionHref,
      chapterId,
      estimatedUnits: estimateBlockUnits({ tagName, text: chunk }),
      textSegments: [
        {
          id: segmentId,
          text: chunk,
        },
      ],
    };
  });
}

function createImageBlock($, element, entries, basePath, sectionHref, blockIndex, chapterId = "") {
  const node = $(element);
  const src = cleanText(node.attr("src"));
  if (!src) return null;
  const assetPath = normalizePath(joinPath(dirname(basePath), src));
  const ext = assetPath.split(".").pop()?.toLowerCase() || "jpeg";
  const mimeType = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
  const base64 = readArchiveBase64(entries, assetPath);
  if (!base64) return null;
  const alt = normalizeWhitespace(node.attr("alt") || "Illustration");
  const segmentId = buildTextSegmentId(sectionHref, blockIndex, 0);

  return {
    id: `${toAsciiSlug(sectionHref)}-${blockIndex}`,
    tagName: "figure",
    html: `<figure ${buildBlockAttributeString({
      tagName: "figure",
      blockId: segmentId,
      anchors: collectNodeAnchors($, element),
    })}><img src="data:${mimeType};base64,${base64}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`,
    text: alt,
    anchors: collectNodeAnchors($, element),
    sectionHref,
    chapterId,
    estimatedUnits: estimateBlockUnits({ hasImage: true }),
    textSegments: [{ id: segmentId, text: alt }],
  };
}

function extractBlocksFromBody({ $, entries, sectionHref, basePath, chapterId = "" }) {
  const body = $("body").first();
  const blocks = [];

  function walk(element) {
    const node = $(element);
    const tagName = (element.tagName || "").toLowerCase();
    if (!tagName) return;

    if (BLOCK_TAGS.has(tagName)) {
      blocks.push(...createTextBlocksForElement($, element, sectionHref, blocks.length, chapterId));
      return;
    }

    if (tagName === "img") {
      const imageBlock = createImageBlock($, element, entries, basePath, sectionHref, blocks.length, chapterId);
      if (imageBlock) blocks.push(imageBlock);
      return;
    }

    if (tagName === "li") {
      const listText = normalizeWhitespace(node.text());
      if (!listText) return;
      const segmentId = buildTextSegmentId(sectionHref, blocks.length, 0);
      blocks.push({
        id: `${toAsciiSlug(sectionHref)}-${blocks.length}`,
        tagName: "li",
        html: `<p ${buildBlockAttributeString({
          tagName: "li",
          blockId: segmentId,
          anchors: collectNodeAnchors($, element),
        })}>&bull; ${listText}</p>`,
        text: listText,
        anchors: collectNodeAnchors($, element),
        sectionHref,
        chapterId,
        estimatedUnits: estimateBlockUnits({ tagName: "p", text: listText }),
        textSegments: [{ id: segmentId, text: listText }],
      });
      return;
    }

    node.contents().each((_, child) => {
      if (child.type === "tag") walk(child);
    });
  }

  body.contents().each((_, child) => {
    if (child.type === "tag") walk(child);
  });

  return blocks;
}

function extractTocFromNavDocument(navHtml = "", navPath = "") {
  if (!navHtml) return [];
  const $ = load(navHtml, { xmlMode: false, decodeEntities: false });
  let rootNav = null;
  $("nav").each((_, element) => {
    if (rootNav) return;
    const node = $(element);
    const epubType = cleanText(node.attr("epub:type") || node.attr("type") || "");
    const role = cleanText(node.attr("role"));
    if (epubType === "toc" || role === "doc-toc") {
      rootNav = node;
    }
  });
  if (!rootNav) {
    rootNav = $("nav").first();
  }
  if (!rootNav?.length) return [];

  const tocItems = [];
  function walkList(listNode, depth = 0) {
    listNode.children("li").each((_, element) => {
      const item = $(element);
      const anchor = item.children("a").first();
      if (anchor.length) {
        const label = normalizeWhitespace(anchor.text());
        const href = normalizeTargetKey(navPath, anchor.attr("href") || "");
        if (label && href) {
          tocItems.push({
            id: `${toAsciiSlug(label)}-${tocItems.length}`,
            label,
            href,
            depth,
          });
        }
      }
      const nested = item.children("ol, ul").first();
      if (nested.length) {
        walkList(nested, depth + 1);
      }
    });
  }

  const firstList = rootNav.find("ol, ul").first();
  if (firstList.length) walkList(firstList, 0);
  return tocItems;
}

function extractTocFromNcx(ncxXml = "", ncxPath = "") {
  if (!ncxXml) return [];
  const $ = load(ncxXml, { xmlMode: true });
  const tocItems = [];

  function walkPoint(element, depth = 0) {
    const node = $(element);
    const label = normalizeWhitespace(node.find("navLabel > text").first().text());
    const href = normalizeTargetKey(ncxPath, node.find("content").first().attr("src") || "");
    if (label && href) {
      tocItems.push({
        id: `${toAsciiSlug(label)}-${tocItems.length}`,
        label,
        href,
        depth,
      });
    }
    node.children("navPoint").each((_, child) => walkPoint(child, depth + 1));
  }

  $("navMap > navPoint").each((_, element) => walkPoint(element, 0));
  return tocItems;
}

export function normalizeFlipbookTargetKey(target = "") {
  return cleanText(target).replace(/\\/g, "/");
}

export async function normalizeFlipbookPublication({
  epubBytes,
  coverUrl = "",
  fallbackTitle = "",
  fallbackAuthor = "",
} = {}) {
  const entries = createArchiveMap(epubBytes);
  const opfPath = resolveContainerOpfPath(entries);
  if (!opfPath) {
    throw new Error("The EPUB package could not be resolved.");
  }

  const opfXml = readArchiveText(entries, opfPath);
  const $package = load(opfXml, { xmlMode: true });
  const opfDir = dirname(opfPath);
  const manifestItems = mapManifestItems($package, opfDir);
  const spineItems = [];
  $package("spine > itemref").each((_, element) => {
    const idref = cleanText($package(element).attr("idref"));
    const item = manifestItems.get(idref);
    if (item) spineItems.push(item);
  });

  const metadataTitle =
    normalizeWhitespace($package("metadata > title, metadata > dc\\:title").first().text()) || fallbackTitle;
  const metadataAuthor =
    normalizeWhitespace($package("metadata > creator, metadata > dc\\:creator").first().text()) || fallbackAuthor;

  const navItem = Array.from(manifestItems.values()).find((item) => cleanText(item.properties).includes("nav"));
  const ncxItem = Array.from(manifestItems.values()).find((item) => item.mediaType === "application/x-dtbncx+xml");
  const tocFromNav = extractTocFromNavDocument(readArchiveText(entries, navItem?.href || ""), navItem?.href || "");
  const toc = tocFromNav.length
    ? tocFromNav
    : extractTocFromNcx(readArchiveText(entries, ncxItem?.href || ""), ncxItem?.href || "");

  const normalizedToc = toc.length
    ? toc
    : spineItems.map((item, index) => ({
        id: `section-${index}`,
        label: `Section ${index + 1}`,
        href: item.href,
        depth: 0,
      }));

  const filteredToc = normalizedToc.filter((item) => {
    const baseHref = normalizePath(item.href.split("#")[0] || "");
    if (!baseHref) return false;
    const manifestItem = Array.from(manifestItems.values()).find((entry) => entry.href === baseHref);
    const sectionType = inferSectionType({
      href: baseHref,
      properties: manifestItem?.properties || "",
      title: item.label,
    });
    return !SKIPPED_SECTION_TYPES.has(sectionType);
  });

  const chapterTargets = new Map();
  filteredToc.forEach((item) => {
    if (item.href && !chapterTargets.has(item.href)) chapterTargets.set(item.href, item.id);
    const baseHref = item.href.split("#")[0] || "";
    if (baseHref && !chapterTargets.has(baseHref)) chapterTargets.set(baseHref, item.id);
  });

  const sections = [];
  for (const item of spineItems) {
    const rawSectionHtml = readArchiveText(entries, item.href);
    if (!rawSectionHtml) continue;

    const $ = load(rawSectionHtml, { xmlMode: false, decodeEntities: false });
    const sectionTitle =
      normalizeWhitespace($("title").first().text()) ||
      normalizeWhitespace($("h1, h2").first().text());
    const sectionType = inferSectionType({
      href: item.href,
      properties: item.properties,
      title: sectionTitle,
    });
    if (SKIPPED_SECTION_TYPES.has(sectionType)) {
      continue;
    }

    const chapterId = chapterTargets.get(item.href) || "";
    const blocks = extractBlocksFromBody({
      $,
      entries,
      sectionHref: item.href,
      basePath: item.href,
      chapterId,
    });
    if (!blocks.length) continue;

    sections.push({
      id: item.href,
      href: item.href,
      sectionType,
      chapterId,
      title: sectionTitle,
      blocks,
    });
  }

  return {
    metadata: {
      title: metadataTitle,
      author: metadataAuthor,
      coverUrl: cleanText(coverUrl),
    },
    toc: filteredToc,
    sections,
    sourceHash: createHash("sha256").update(Buffer.from(epubBytes)).digest("hex"),
  };
}
