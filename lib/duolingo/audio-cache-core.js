import { createHash } from "node:crypto";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeSpeechTextCore(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function buildAudioCacheKeyCore({ language, voiceId, text, modelId }) {
  const normalized = [
    cleanText(language).toLowerCase() || "en",
    cleanText(voiceId),
    cleanText(modelId),
    normalizeSpeechTextCore(text),
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex");
}

export function isCachedAudioReusable(record) {
  return Boolean(record && (record.audio_url || record.r2_key));
}

