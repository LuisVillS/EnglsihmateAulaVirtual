import { createHash } from "node:crypto";
import { cleanText, normalizeWhitespace } from "../library/normalization.js";
import { FLIPBOOK_GENERATOR_VERSION, resolveFlipbookLayoutProfile } from "./layout-profile.js";

function hashString(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 20);
}

function buildPageId({ manifestId, pageIndex, startLocator, endLocator }) {
  return `page-${hashString(`${manifestId}:${pageIndex}:${startLocator}:${endLocator}`)}`;
}

function buildCoverPage({ manifestId, layoutProfileId, title, author, coverUrl }) {
  const startLocator = "synthetic-cover:start";
  const endLocator = "synthetic-cover:end";
  const safeTitle = normalizeWhitespace(title);
  const safeAuthor = normalizeWhitespace(author);
  return {
    pageId: buildPageId({ manifestId, pageIndex: 0, startLocator, endLocator }),
    pageIndex: 0,
    layoutProfileId,
    chapterId: "synthetic-cover",
    sectionId: "synthetic-cover",
    startLocator,
    endLocator,
    html: coverUrl
      ? `<article class="flipbook-page-inner flipbook-cover-page"><img src="${coverUrl}" alt="${safeTitle}" class="flipbook-cover-image" /></article>`
      : `<article class="flipbook-page-inner flipbook-cover-page flipbook-cover-fallback"><div><p class="flipbook-cover-kicker">EnglishMate Library</p><h1>${safeTitle}</h1><p>${safeAuthor}</p></div></article>`,
    textSegments: [],
    flags: {
      isSyntheticCover: true,
      isFrontmatter: false,
      isChapterStart: false,
    },
  };
}

function createPagePayload({
  manifestId,
  layoutProfileId,
  pageIndex,
  blocks,
  chapterId,
  sectionId,
  isChapterStart = false,
} = {}) {
  const startLocator = cleanText(blocks[0]?.anchors?.[0])
    ? `${sectionId}#${blocks[0].anchors[0]}`
    : `${sectionId}#block-${pageIndex}-start`;
  const lastBlock = blocks.at(-1);
  const endLocator = cleanText(lastBlock?.anchors?.at(-1))
    ? `${sectionId}#${lastBlock.anchors.at(-1)}`
    : `${sectionId}#block-${pageIndex}-end`;

  return {
    pageId: buildPageId({ manifestId, pageIndex, startLocator, endLocator }),
    pageIndex,
    layoutProfileId,
    chapterId: chapterId || sectionId,
    sectionId,
    startLocator,
    endLocator,
    html: `<article class="flipbook-page-inner">${blocks.map((block) => block.html).join("")}</article>`,
    textSegments: blocks.flatMap((block) => block.textSegments || []),
    flags: {
      isSyntheticCover: false,
      isFrontmatter: false,
      isChapterStart,
    },
  };
}

export function buildFlipbookManifestId({ libraryBookId = "", sourceFingerprint = "", layoutProfileId = "" } = {}) {
  return `manifest-${hashString(`${libraryBookId}:${sourceFingerprint}:${layoutProfileId}:${FLIPBOOK_GENERATOR_VERSION}`)}`;
}

export function paginateFlipbookPublication({
  normalizedPublication,
  layoutProfile = null,
  manifestId = "",
  layoutProfileId = "",
  sourceFingerprint = "",
} = {}) {
  const resolvedLayout = resolveFlipbookLayoutProfile(layoutProfile);
  const maxPageUnits = Number(resolvedLayout.config?.maxPageUnits) || 92;
  const pages = [
    buildCoverPage({
      manifestId,
      layoutProfileId,
      title: normalizedPublication?.metadata?.title,
      author: normalizedPublication?.metadata?.author,
      coverUrl: normalizedPublication?.metadata?.coverUrl,
    }),
  ];
  const sectionPageMap = new Map();
  const anchorPageMap = new Map();

  for (const section of normalizedPublication?.sections || []) {
    let currentBlocks = [];
    let currentUnits = 0;
    let sectionFirstPageIndex = null;
    let currentPageStartsChapter = true;

    for (const block of section.blocks) {
      const blockUnits = Number(block.estimatedUnits) || 8;
      if (currentBlocks.length && currentUnits + blockUnits > maxPageUnits) {
        const page = createPagePayload({
          manifestId,
          layoutProfileId,
          pageIndex: pages.length,
          blocks: currentBlocks,
          chapterId: section.chapterId,
          sectionId: section.href,
          isChapterStart: currentPageStartsChapter,
        });
        pages.push(page);
        sectionFirstPageIndex ??= page.pageIndex;
        currentBlocks.forEach((pageBlock) => {
          (pageBlock.anchors || []).forEach((anchor) => {
            anchorPageMap.set(`${section.href}#${anchor}`, page.pageIndex);
          });
        });
        currentBlocks = [];
        currentUnits = 0;
        currentPageStartsChapter = false;
      }

      currentBlocks.push(block);
      currentUnits += blockUnits;
    }

    if (currentBlocks.length) {
      const page = createPagePayload({
        manifestId,
        layoutProfileId,
        pageIndex: pages.length,
        blocks: currentBlocks,
        chapterId: section.chapterId,
        sectionId: section.href,
        isChapterStart: currentPageStartsChapter,
      });
      pages.push(page);
      sectionFirstPageIndex ??= page.pageIndex;
      currentBlocks.forEach((pageBlock) => {
        (pageBlock.anchors || []).forEach((anchor) => {
          anchorPageMap.set(`${section.href}#${anchor}`, page.pageIndex);
        });
      });
    }

    if (sectionFirstPageIndex != null) {
      sectionPageMap.set(section.href, sectionFirstPageIndex);
    }
  }

  const toc = (normalizedPublication?.toc || []).map((item) => ({
    ...item,
    pageIndex:
      anchorPageMap.get(item.href) ??
      sectionPageMap.get(item.href.split("#")[0] || "") ??
      1,
  }));

  const anchorMap = {};
  sectionPageMap.forEach((pageIndex, href) => {
    anchorMap[href] = pageIndex;
  });
  anchorPageMap.forEach((pageIndex, href) => {
    anchorMap[href] = pageIndex;
  });

  return {
    manifestVersion: FLIPBOOK_GENERATOR_VERSION,
    manifestId,
    layoutProfileId,
    sourceFingerprint: cleanText(sourceFingerprint),
    metadata: {
      ...normalizedPublication?.metadata,
      totalPages: pages.length,
    },
    toc,
    anchorMap,
    pages,
  };
}

export function resolveFlipbookChapterLabel(toc = [], pageIndex = 0) {
  const items = (Array.isArray(toc) ? toc : [])
    .filter((item) => Number.isFinite(Number(item.pageIndex)))
    .sort((a, b) => Number(a.pageIndex) - Number(b.pageIndex));
  let active = items[0]?.label || "";
  for (const item of items) {
    if (Number(item.pageIndex) <= Number(pageIndex)) {
      active = item.label;
    }
  }
  return active;
}

export function buildFlipbookSpreadLabel({ pageIndex = 0, totalPages = 0, isPortrait = false } = {}) {
  if (isPortrait) {
    return `${pageIndex + 1}/${totalPages}`;
  }

  const left = pageIndex + 1;
  const right = totalPages > pageIndex + 1 ? pageIndex + 2 : null;
  return right ? `${left}-${right}/${totalPages}` : `${left}/${totalPages}`;
}
