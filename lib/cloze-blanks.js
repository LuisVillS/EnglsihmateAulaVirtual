function toText(value) {
  if (value == null) return "";
  return String(value);
}

export function normalizeBlankKey(value, fallbackIndex = 1) {
  const raw = toText(value).trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return `blank_${fallbackIndex}`;
  if (raw.startsWith("blank_")) return raw;
  return `blank_${raw}`;
}

function iterateBlankMatches(sentence = "") {
  const text = toText(sentence);
  const regex = /\[\[\s*(blank_[a-z0-9_-]+)\s*\]\]|\[blank\]|_{2,}/gi;
  const matches = [];
  let match = regex.exec(text);
  while (match) {
    matches.push({
      raw: String(match[0] || ""),
      tokenKey: String(match[1] || "").trim(),
      index: match.index,
      lastIndex: regex.lastIndex,
    });
    match = regex.exec(text);
  }
  return { text, matches };
}

export function extractBlankKeys(sentence = "") {
  const { matches } = iterateBlankMatches(sentence);
  const seen = new Set();
  const keys = [];
  matches.forEach((match, idx) => {
    const key = normalizeBlankKey(match.tokenKey, idx + 1);
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  });
  return keys;
}

export function tokenizeClozeSentence(sentence = "", fallbackBlankKeys = []) {
  const text = toText(sentence);
  const fallbackKeys = Array.isArray(fallbackBlankKeys) ? fallbackBlankKeys : [];
  const { matches } = iterateBlankMatches(text);
  const orderedKeys = [];
  let output = "";
  let cursor = 0;
  let lastIndex = 0;

  matches.forEach((match) => {
    output += text.slice(lastIndex, match.index);
    let key = normalizeBlankKey(match.tokenKey, orderedKeys.length + 1);
    if (!match.tokenKey) {
      const fallbackKey = normalizeBlankKey(
        fallbackKeys[cursor] || `blank_${orderedKeys.length + 1}`,
        orderedKeys.length + 1
      );
      key = fallbackKey;
      cursor += 1;
    }
    orderedKeys.push(key);
    output += `[[${key}]]`;
    lastIndex = match.lastIndex;
  });

  output += text.slice(lastIndex);

  if (!matches.length && fallbackKeys.length) {
    const normalizedFallback = fallbackKeys.map((key, index) => normalizeBlankKey(key, index + 1));
    const suffix = normalizedFallback.map((key) => `[[${key}]]`).join(" ");
    output = `${text}${text ? " " : ""}${suffix}`;
    orderedKeys.push(...normalizedFallback);
  }

  return {
    sentence: output,
    orderedKeys,
  };
}

export function splitClozeSentenceSegments(sentence = "", fallbackBlankKeys = []) {
  const text = toText(sentence);
  const fallbackKeys = Array.isArray(fallbackBlankKeys) ? fallbackBlankKeys : [];
  const { matches } = iterateBlankMatches(text);
  const segments = [];
  const orderedKeys = [];
  let cursor = 0;
  let lastIndex = 0;

  matches.forEach((match) => {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    let key = normalizeBlankKey(match.tokenKey, orderedKeys.length + 1);
    if (!match.tokenKey) {
      key = normalizeBlankKey(
        fallbackKeys[cursor] || `blank_${orderedKeys.length + 1}`,
        orderedKeys.length + 1
      );
      cursor += 1;
    }
    orderedKeys.push(key);
    segments.push({ kind: "blank", key });
    lastIndex = match.lastIndex;
  });

  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  if (!matches.length && fallbackKeys.length) {
    fallbackKeys.forEach((key, index) => {
      const normalized = normalizeBlankKey(key, index + 1);
      orderedKeys.push(normalized);
      segments.push({ kind: "blank", key: normalized });
      if (index < fallbackKeys.length - 1) {
        segments.push({ kind: "text", value: " " });
      }
    });
  }

  if (!segments.length) {
    segments.push({ kind: "text", value: text });
  }

  return { segments, orderedKeys };
}

export function toClozeDisplayText(sentence = "") {
  const text = toText(sentence);
  return text
    .replace(/\[\[\s*blank_[a-z0-9_-]+\s*\]\]/gi, "[Blank]")
    .replace(/_{2,}/g, "[Blank]");
}
