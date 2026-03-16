import { cleanText, normalizeWhitespace } from "./normalization.js";

export const LIBRARY_TTS_VOICE_OPTIONS = [
  {
    id: "en_gb-alba-medium",
    displayLabel: "Alba",
    label: "Alba",
    modelId: "en_GB-alba-medium",
    speakerId: null,
    envKey: "ALBA",
    aliases: ["alba", "en_gb-alba-medium", "en_GB-alba-medium"],
  },
  {
    id: "en_gb-aru-medium:03(0)",
    displayLabel: "Jenny",
    label: "en_GB-aru-medium 03(0) [Jenny]",
    modelId: "en_GB-aru-medium",
    speakerId: 0,
    envKey: "JENNY",
    aliases: [
      "jenny",
      "en_gb-aru-medium",
      "en_GB-aru-medium",
      "en_gb-aru-medium:03(0)",
      "en_GB-aru-medium:03(0)",
      "en_GB-aru-medium 03(0) [Jenny]",
      "en_gb-aru-medium 03(0) [jenny]",
      "en_gb-aru-medium:7",
      "en_gb-aru-medium:03",
    ],
  },
  {
    id: "en_gb-aru-medium:12(8)",
    displayLabel: "Jhon",
    label: "en_GB-aru-medium 12(8) [Jhon]",
    modelId: "en_GB-aru-medium",
    speakerId: 8,
    envKey: "JHON",
    aliases: [
      "jhon",
      "john",
      "en_gb-aru-medium:12(8)",
      "en_GB-aru-medium:12(8)",
      "en_GB-aru-medium 12(8) [Jhon]",
      "en_gb-aru-medium 12(8) [jhon]",
      "en_gb-aru-medium:10",
      "en_gb-aru-medium:12",
    ],
  },
];

const LIBRARY_TTS_VOICE_MAP = new Map();

for (const voice of LIBRARY_TTS_VOICE_OPTIONS) {
  for (const alias of [voice.id, voice.modelId, voice.label, ...(voice.aliases || [])]) {
    const normalizedAlias = cleanText(alias).toLowerCase();
    if (!normalizedAlias) continue;
    LIBRARY_TTS_VOICE_MAP.set(normalizedAlias, voice);
  }
}

export function resolveLibraryTtsVoice(voiceId = "") {
  const safeVoiceId = cleanText(voiceId).toLowerCase();
  return LIBRARY_TTS_VOICE_MAP.get(safeVoiceId) || LIBRARY_TTS_VOICE_OPTIONS[0];
}

export function normalizeLibraryTtsVoiceId(voiceId = "") {
  return resolveLibraryTtsVoice(voiceId).id;
}

export function normalizeLibraryTtsText(text = "") {
  return normalizeWhitespace(String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " "));
}

export function sanitizeLibraryTtsText(text = "") {
  const raw = String(text || "");
  const codePointSafe = Array.from(raw)
    .filter((character) => {
      const codePoint = character.codePointAt(0) || 0;
      return codePoint < 0xd800 || codePoint > 0xdfff;
    })
    .join("");

  const withoutControlChars = codePointSafe
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g, " ");

  let normalized = withoutControlChars;
  try {
    normalized = withoutControlChars.normalize("NFKC");
  } catch {
    normalized = withoutControlChars;
  }

  const utf8SafeText = Buffer.from(normalized, "utf8").toString("utf8");
  return normalizeLibraryTtsText(utf8SafeText);
}

export function splitLibraryTtsSentences(text = "") {
  const normalized = normalizeLibraryTtsText(text);
  if (!normalized) return [];

  const SentenceSegmenter =
    typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
      ? Intl.Segmenter
      : null;

  if (SentenceSegmenter) {
    try {
      const segmenter = new SentenceSegmenter("en", { granularity: "sentence" });
      const segments = Array.from(segmenter.segment(normalized))
        .map((segment) => normalizeLibraryTtsText(segment?.segment))
        .filter(Boolean);
      if (segments.length) return segments;
    } catch {
      // Fall through to regex splitting.
    }
  }

  return normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/g)
    .map((sentence) => normalizeLibraryTtsText(sentence))
    .filter(Boolean);
}

export function splitLibraryTtsClauses(text = "") {
  const normalized = normalizeLibraryTtsText(text);
  if (!normalized) return [];

  return normalized
    .split(/(?<=[,;:.!?])\s+/g)
    .map((clause) => normalizeLibraryTtsText(clause))
    .filter(Boolean);
}

export function resolveLibraryTtsPauseAfterMs(text = "") {
  const normalized = normalizeLibraryTtsText(text);
  if (!normalized) return 0;
  if (/[.!?]["')\]]*$/.test(normalized)) return 1500;
  if (/[;:]["')\]]*$/.test(normalized)) return 1000;
  if (/,["')\]]*$/.test(normalized)) return 700;
  return 0;
}

export function buildLibraryTtsPlaybackQueue(segments = [], { maxChunkLength = 700 } = {}) {
  return (Array.isArray(segments) ? segments : []).flatMap((segment) => {
    const normalizedText = sanitizeLibraryTtsText(segment?.text);
    if (!normalizedText) return [];

    const sentences = splitLibraryTtsSentences(normalizedText);
    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences.length ? sentences : [normalizedText]) {
      if (!currentChunk) {
        currentChunk = sentence;
        continue;
      }

      const candidate = `${currentChunk} ${sentence}`.trim();
      if (candidate.length > maxChunkLength) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk = candidate;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    const finalChunks = chunks.flatMap((chunk) => {
      const clauses = splitLibraryTtsClauses(chunk);
      return clauses.length ? clauses : [chunk];
    });

    return finalChunks.map((chunk, index) => ({
      segmentId: cleanText(segment?.id),
      segmentText: normalizedText,
      text: chunk,
      chunkIndex: index,
      chunkCount: finalChunks.length,
      highlightMode: "paragraph",
      pauseAfterMs: resolveLibraryTtsPauseAfterMs(chunk),
    }));
  });
}
