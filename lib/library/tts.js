import { cleanText, normalizeWhitespace } from "./normalization.js";

export const LIBRARY_TTS_VOICE_OPTIONS = [
  {
    id: "alba",
    label: "Alba",
    modelId: "en_GB-alba-medium",
    speakerId: null,
  },
  {
    id: "jenny",
    label: "Jenny",
    modelId: "en_GB-aru-medium",
    speakerId: 7,
  },
  {
    id: "jhon",
    label: "Jhon",
    modelId: "en_GB-aru-medium",
    speakerId: 10,
  },
];

const LIBRARY_TTS_VOICE_MAP = new Map(
  LIBRARY_TTS_VOICE_OPTIONS.map((voice) => [voice.id, voice])
);

export function resolveLibraryTtsVoice(voiceId = "") {
  const safeVoiceId = cleanText(voiceId).toLowerCase();
  return LIBRARY_TTS_VOICE_MAP.get(safeVoiceId) || LIBRARY_TTS_VOICE_OPTIONS[0];
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

    return chunks.map((chunk, index) => ({
      segmentId: cleanText(segment?.id),
      segmentText: normalizedText,
      text: chunk,
      chunkIndex: index,
      chunkCount: chunks.length,
      highlightMode: "paragraph",
    }));
  });
}
