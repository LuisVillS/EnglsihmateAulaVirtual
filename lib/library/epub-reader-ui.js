import { cleanText, normalizeWhitespace } from "./normalization.js";

export const LIBRARY_EPUB_THEME_MAP = {
  light: {
    id: "light",
    label: "Light",
    stageBackground: "#151718",
    stageSurface: "radial-gradient(circle at top, rgba(255,255,255,0.08), rgba(255,255,255,0) 46%), linear-gradient(180deg, #232527 0%, #111315 100%)",
    stageGlow: "rgba(239, 223, 192, 0.2)",
    shellBackground: "#f4efe5",
    shellText: "#1b1f26",
    paperBackground: "#fcf8ef",
    paperEdge: "#d6c8ad",
    paperShadow: "0 28px 80px rgba(0, 0, 0, 0.38)",
    controlBackground: "rgba(19, 20, 23, 0.82)",
    controlBorder: "rgba(255, 255, 255, 0.12)",
    controlText: "#f7f1e4",
    rules: {
      html: {
        "background-color": "#fcf8ef !important",
        color: "#1b1f26 !important",
      },
      body: {
        "background-color": "#fcf8ef !important",
        color: "#1b1f26 !important",
        "line-height": "1.78",
        "text-rendering": "optimizeLegibility",
        "font-kerning": "normal",
      },
      p: {
        "margin-bottom": "1.05em !important",
      },
      "h1, h2, h3, h4": {
        "letter-spacing": "-0.02em",
        "line-height": "1.22",
      },
      img: {
        "max-width": "100% !important",
        height: "auto !important",
        "-webkit-user-drag": "none",
      },
      a: {
        color: "#8a4f1d !important",
      },
      "::selection": {
        "background-color": "transparent !important",
      },
    },
  },
  sepia: {
    id: "sepia",
    label: "Sepia",
    stageBackground: "#14110f",
    stageSurface: "radial-gradient(circle at top, rgba(255,231,190,0.08), rgba(255,255,255,0) 44%), linear-gradient(180deg, #201a17 0%, #110d0b 100%)",
    stageGlow: "rgba(230, 195, 138, 0.22)",
    shellBackground: "#e9dcc4",
    shellText: "#382a19",
    paperBackground: "#f0e2c9",
    paperEdge: "#cdb692",
    paperShadow: "0 28px 80px rgba(0, 0, 0, 0.42)",
    controlBackground: "rgba(28, 22, 18, 0.84)",
    controlBorder: "rgba(255, 231, 190, 0.14)",
    controlText: "#f3e7d1",
    rules: {
      html: {
        "background-color": "#f0e2c9 !important",
        color: "#382a19 !important",
      },
      body: {
        "background-color": "#f0e2c9 !important",
        color: "#382a19 !important",
        "line-height": "1.8",
        "text-rendering": "optimizeLegibility",
        "font-kerning": "normal",
      },
      p: {
        "margin-bottom": "1.08em !important",
      },
      "h1, h2, h3, h4": {
        "letter-spacing": "-0.02em",
        "line-height": "1.24",
      },
      img: {
        "max-width": "100% !important",
        height: "auto !important",
        "-webkit-user-drag": "none",
      },
      a: {
        color: "#89511c !important",
      },
      "::selection": {
        "background-color": "transparent !important",
      },
    },
  },
  dark: {
    id: "dark",
    label: "Dark",
    stageBackground: "#090b0f",
    stageSurface: "radial-gradient(circle at top, rgba(117,167,255,0.1), rgba(255,255,255,0) 42%), linear-gradient(180deg, #0d1118 0%, #07090d 100%)",
    stageGlow: "rgba(91, 138, 214, 0.22)",
    shellBackground: "#111722",
    shellText: "#edf2fb",
    paperBackground: "#121923",
    paperEdge: "#223247",
    paperShadow: "0 28px 80px rgba(0, 0, 0, 0.5)",
    controlBackground: "rgba(9, 12, 18, 0.84)",
    controlBorder: "rgba(151, 181, 224, 0.16)",
    controlText: "#eef3fb",
    rules: {
      html: {
        "background-color": "#121923 !important",
        color: "#eef3fb !important",
      },
      body: {
        "background-color": "#121923 !important",
        color: "#eef3fb !important",
        "line-height": "1.82",
        "text-rendering": "optimizeLegibility",
        "font-kerning": "normal",
      },
      p: {
        "margin-bottom": "1.08em !important",
      },
      "h1, h2, h3, h4": {
        "letter-spacing": "-0.02em",
        "line-height": "1.24",
      },
      img: {
        "max-width": "100% !important",
        height: "auto !important",
        "-webkit-user-drag": "none",
      },
      a: {
        color: "#98c5ff !important",
      },
      "::selection": {
        "background-color": "transparent !important",
      },
    },
  },
};

export const LIBRARY_EPUB_THEME_OPTIONS = Object.values(LIBRARY_EPUB_THEME_MAP).map((theme) => ({
  value: theme.id,
  label: theme.label,
}));

export function resolveLibraryEpubTheme(theme = "sepia") {
  const safeTheme = cleanText(theme).toLowerCase();
  return LIBRARY_EPUB_THEME_MAP[safeTheme] || LIBRARY_EPUB_THEME_MAP.sepia;
}

export function clampLibraryEpubFontScale(value, { min = 90, max = 150, fallback = 100 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeLibraryTocHref(href = "") {
  const safeHref = cleanText(href);
  if (!safeHref) return "";
  return safeHref.replace(/^\.?\//, "").split("#")[0].trim();
}

export function flattenLibraryTocItems(items = [], depth = 0) {
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    if (!item) return [];

    const href = cleanText(item.href);
    const label = normalizeWhitespace(item.label) || "Untitled section";
    const current = href
      ? [
          {
            href,
            value: href,
            label,
            depth,
          },
        ]
      : [];

    return [...current, ...flattenLibraryTocItems(item.subitems || [], depth + 1)];
  });
}

export function resolveLibraryTocLabel(tocItems = [], href = "") {
  const normalizedHref = normalizeLibraryTocHref(href);
  if (!normalizedHref) return "";

  const matched = flattenLibraryTocItems(tocItems).find(
    (item) => normalizeLibraryTocHref(item.href) === normalizedHref
  );

  return matched?.label || "";
}

export function shouldShowLibraryBookmarkPanel(reader = null) {
  return reader?.type !== "epub";
}

export function canUseLibraryReaderArrowKeys(event) {
  const key = cleanText(event?.key);
  if (!["ArrowLeft", "ArrowRight"].includes(key)) return false;
  if (event?.altKey || event?.ctrlKey || event?.metaKey) return false;

  const target = event?.target;
  if (target?.closest?.("[data-reader-ignore-keys='true']")) return false;

  const tagName = cleanText(target?.tagName).toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagName)) return false;
  if (target?.isContentEditable) return false;

  return true;
}

export function getLibraryEpubPageIndicator(state = {}) {
  const pageNumber = Number(state.pageNumber) || null;
  const pageTotal = Number(state.pageTotal) || null;
  if (!pageNumber) return "";
  return pageTotal ? `${pageNumber}/${pageTotal}` : `Page ${pageNumber}`;
}

export function resolveLibraryEpubPageKind(href = "") {
  const safeHref = normalizeLibraryTocHref(href);
  const fileName = safeHref.split("/").pop() || "";

  if (!fileName) return "body";
  if (/^(cover|titlepage)\.xhtml$/i.test(fileName)) return "title-leaf";
  if (/^(volume-\d+|book-\d+-?\d*)\.xhtml$/i.test(fileName)) return "divider";
  if (/^(imprint|halftitlepage|preface|colophon|uncopyright|loi)\.xhtml$/i.test(fileName)) return "body";
  return "body";
}

export function resolveLibraryEpubDisplayMode({
  href = "",
  location = null,
  locationIndex = null,
  locationTotal = null,
  isMobile = false,
} = {}) {
  if (isMobile) return "single";

  if (Boolean(location?.atStart)) {
    return "single";
  }

  return "spread";
}

export function resolveLibraryEpubVisiblePageNumbers({
  location = null,
  pageNumber = null,
  pageTotal = null,
  displayMode = "spread",
  spreadStartPageNumber = null,
  spreadEndPageNumber = null,
} = {}) {
  const numericPageNumber =
    pageNumber == null || pageNumber === "" ? null : Number(pageNumber);
  const numericPageTotal =
    pageTotal == null || pageTotal === "" ? null : Number(pageTotal);
  const explicitSpreadStart =
    spreadStartPageNumber == null || spreadStartPageNumber === ""
      ? null
      : Number(spreadStartPageNumber);
  const explicitSpreadEnd =
    spreadEndPageNumber == null || spreadEndPageNumber === ""
      ? null
      : Number(spreadEndPageNumber);

  if (displayMode === "single") {
    return {
      left:
        Number.isFinite(explicitSpreadStart) && explicitSpreadStart > 0
          ? explicitSpreadStart
          : Number.isFinite(numericPageNumber) && numericPageNumber > 0
          ? numericPageNumber
          : null,
      right: null,
    };
  }
  if (Number.isFinite(explicitSpreadStart) && explicitSpreadStart > 0) {
    return {
      left: explicitSpreadStart,
      right:
        Number.isFinite(explicitSpreadEnd) && explicitSpreadEnd > explicitSpreadStart
          ? explicitSpreadEnd
          : null,
    };
  }
  if (!Number.isFinite(numericPageNumber) || numericPageNumber <= 0) {
    return {
      left: null,
      right: null,
    };
  }

  const normalizedSpreadStart =
    numericPageNumber % 2 === 0 ? numericPageNumber : numericPageNumber - 1;
  const normalizedRightPage =
    Number.isFinite(numericPageTotal) && numericPageTotal > 0
      ? Math.min(numericPageTotal, normalizedSpreadStart + 1)
      : normalizedSpreadStart + 1;

  return {
    left: normalizedSpreadStart,
    right: normalizedRightPage > normalizedSpreadStart ? normalizedRightPage : null,
  };
}

export function resolveLibraryEpubPageState({
  location = null,
  locationIndex = null,
  locationTotal = null,
} = {}) {
  const numericLocationIndex =
    locationIndex == null || locationIndex === "" ? null : Number(locationIndex);
  const numericLocationTotal =
    locationTotal == null || locationTotal === "" ? null : Number(locationTotal);
  const globalPageNumber =
    Number.isFinite(numericLocationIndex) && numericLocationIndex >= 0
      ? numericLocationIndex + 1
      : null;
  const globalPageTotal =
    Number.isFinite(numericLocationTotal) && numericLocationTotal >= 0
      ? numericLocationTotal + 1
      : null;

  if (globalPageNumber) {
    return {
      pageNumber: globalPageNumber,
      pageTotal: globalPageTotal,
    };
  }

  return {
    pageNumber: null,
    pageTotal: globalPageTotal,
  };
}

export function buildLibraryEpubProgressLabel(state = {}) {
  const pageLabel = getLibraryEpubPageIndicator(state);
  const chapterLabel = normalizeWhitespace(state.chapterLabel);
  const progressPercent =
    state.progressPercent == null || state.progressPercent === "" ? null : Number(state.progressPercent);
  const percentLabel = progressPercent == null || Number.isNaN(progressPercent) ? "" : `${Math.round(progressPercent)}%`;

  return [chapterLabel, pageLabel, percentLabel].filter(Boolean).join(" / ");
}

export function buildLibraryEpubAutoSaveText(lastSavedAt = null) {
  if (!lastSavedAt) return "Your place is saved automatically.";

  const elapsedMs = Date.now() - Date.parse(lastSavedAt);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return "Your place is saved automatically.";
  }
  if (elapsedMs < 60_000) return "Auto-saved just now.";

  const elapsedMinutes = Math.round(elapsedMs / 60_000);
  return `Auto-saved ${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago.`;
}

function createPageNoiseBuffer(context, durationSeconds) {
  const buffer = context.createBuffer(1, context.sampleRate * durationSeconds, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
  }

  return buffer;
}

export function playLibraryPageFlipSound({
  enabled = false,
  audioContextRef = { current: null },
  volume = 0.055,
} = {}) {
  if (!enabled || typeof window === "undefined") return false;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  const context = audioContextRef.current || new AudioContextClass();
  audioContextRef.current = context;

  if (context.state === "suspended") {
    context.resume().catch(() => null);
  }

  const now = context.currentTime;
  const durationSeconds = 0.19;
  const noiseSource = context.createBufferSource();
  noiseSource.buffer = createPageNoiseBuffer(context, durationSeconds);

  const lowPass = context.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.setValueAtTime(1750 + Math.random() * 260, now);
  lowPass.Q.value = 0.6;

  const bandPass = context.createBiquadFilter();
  bandPass.type = "bandpass";
  bandPass.frequency.setValueAtTime(620 + Math.random() * 90, now);
  bandPass.Q.value = 0.8;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

  noiseSource.connect(lowPass);
  lowPass.connect(bandPass);
  bandPass.connect(gain);
  gain.connect(context.destination);

  noiseSource.start(now);
  noiseSource.stop(now + durationSeconds);
  return true;
}
