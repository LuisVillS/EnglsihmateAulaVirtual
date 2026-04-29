export const BLOG_EDITOR_RULES = {
  seoTitle: { recommendedMin: 50, recommendedMax: 60 },
  seoDescription: { recommendedMin: 120, recommendedMax: 160 },
  slug: { recommendedWordsMin: 3, recommendedWordsMax: 5 },
  blogTitle: { recommendedMin: 10, recommendedMax: 70, required: true, hardMax: 160 },
  excerpt: { recommendedMin: 150, recommendedMax: 170, hardMax: 170 },
  body: {
    publishMinWords: 600,
    solidMinWords: 1000,
    strongRangeMin: 1500,
    strongRangeMax: 2500,
    headingWordsInterval: 300,
  },
};

const SLUG_STOP_WORDS = new Set([
  "a",
  "al",
  "and",
  "como",
  "con",
  "de",
  "del",
  "el",
  "en",
  "for",
  "how",
  "la",
  "las",
  "lo",
  "los",
  "of",
  "on",
  "para",
  "por",
  "que",
  "the",
  "to",
  "un",
  "una",
  "y",
]);

function characterCount(value) {
  return [...String(value || "")].length;
}

export function normalizeEditableSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function markdownToPlainText(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/@\[video]\(([^)]+)\)/g, " ")
    .replace(/\[red card]/gi, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(value) {
  const words = markdownToPlainText(value).match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu);
  return words?.length || 0;
}

function countSubheadings(value) {
  const markdownHeadings = String(value || "").match(/^#{2,4}\s+\S.+$/gm)?.length || 0;
  const htmlHeadings = String(value || "").match(/<h[2-4][^>]*>/gi)?.length || 0;
  return markdownHeadings + htmlHeadings;
}

function getParagraphWordCounts(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !/^#{1,6}\s+/.test(paragraph) && !/^[-*]\s+/.test(paragraph))
    .map(countWords)
    .filter((words) => words > 0);
}

function createLengthMetric({
  id,
  label,
  value,
  min,
  max,
  recommendedMin,
  recommendedMax,
  helper,
  required = false,
  hardMax = null,
}) {
  const lower = min ?? recommendedMin;
  const upper = max ?? recommendedMax;
  const count = characterCount(value);
  const hardErrors = [];
  const warnings = [];
  let status = "good";
  let message = "Looks good.";

  if (required && count === 0) {
    status = "invalid";
    message = `${label} is required.`;
    hardErrors.push({ field: id, message });
  } else if (hardMax && count > hardMax) {
    status = "invalid";
    message = `${label} is too long. Keep it under ${hardMax} characters.`;
    hardErrors.push({ field: id, message });
  } else if (count > 0 && count < lower) {
    status = "warning";
    message = `Shorter than the recommended ${lower}-${upper} characters.`;
    warnings.push({ field: id, message });
  } else if (count > upper) {
    status = "warning";
    message = `Longer than recommended and may truncate.`;
    warnings.push({ field: id, message });
  } else if (count === 0) {
    status = "warning";
    message = "Recommended before publishing.";
    warnings.push({ field: id, message });
  }

  return {
    id,
    label,
    count,
    recommendedText: `${lower}-${upper} characters`,
    status,
    message,
    helper,
    hardErrors,
    warnings,
  };
}

function analyzeSlug(slugValue) {
  const slug = normalizeEditableSlug(slugValue);
  const words = slug.split("-").filter(Boolean);
  const hardErrors = [];
  const warnings = [];
  const rules = BLOG_EDITOR_RULES.slug;
  let status = "good";
  let message = "Slug format looks good.";

  if (!slug) {
    status = "invalid";
    message = "Slug is required before publishing.";
    hardErrors.push({ field: "slug", message });
  } else if (slug.includes("_")) {
    status = "invalid";
    message = "Use hyphens instead of underscores in the slug.";
    hardErrors.push({ field: "slug", message });
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    status = "invalid";
    message = "Slug must use lowercase letters, numbers, and hyphens only.";
    hardErrors.push({ field: "slug", message });
  }

  if (slug && words.length < rules.recommendedWordsMin) {
    if (status !== "invalid") status = "warning";
    const warning = "Slug may be too short or unclear.";
    warnings.push({ field: "slug", message: warning });
    if (status === "warning") message = warning;
  }

  if (words.length > rules.recommendedWordsMax) {
    if (status !== "invalid") status = "warning";
    const warning = "Slug is longer than the recommended 3-5 words.";
    warnings.push({ field: "slug", message: warning });
    if (status === "warning") message = warning;
  }

  if (/\b(19|20)\d{2}\b/.test(slug)) {
    if (status !== "invalid") status = "warning";
    const warning = "Avoid dates in slugs unless the date is truly necessary.";
    warnings.push({ field: "slug", message: warning });
    if (status === "warning") message = warning;
  }

  const stopWordCount = words.filter((word) => SLUG_STOP_WORDS.has(word)).length;
  if (words.length >= 4 && stopWordCount / words.length >= 0.5) {
    if (status !== "invalid") status = "warning";
    const warning = "Slug has many filler words. Use more descriptive terms.";
    warnings.push({ field: "slug", message: warning });
    if (status === "warning") message = warning;
  }

  return {
    id: "slug",
    label: "Slug",
    slug,
    count: words.length,
    recommendedText: "3-5 words",
    status,
    message,
    helper: "Recommended: 3-5 descriptive words, lowercase, hyphen-separated.",
    hardErrors,
    warnings,
  };
}

function analyzeBody(contentMarkdown) {
  const wordCount = countWords(contentMarkdown);
  const headingCount = countSubheadings(contentMarkdown);
  const paragraphWordCounts = getParagraphWordCounts(contentMarkdown);
  const longestParagraphWords = Math.max(0, ...paragraphWordCounts);
  const hardErrors = [];
  const warnings = [];
  const rules = BLOG_EDITOR_RULES.body;
  let status = "good";
  let tierLabel = "Strong long-form range";
  let message = "Strong long-form range.";

  if (!String(contentMarkdown || "").trim()) {
    status = "invalid";
    tierLabel = "Missing";
    message = "Article body is required before publishing.";
    hardErrors.push({ field: "content", message });
  } else if (wordCount < rules.publishMinWords) {
    status = "invalid";
    tierLabel = "Too thin";
    message = `Publish requires at least ${rules.publishMinWords} words.`;
    hardErrors.push({ field: "content", message });
  } else if (wordCount < rules.solidMinWords) {
    status = "warning";
    tierLabel = "Acceptable but light";
    message = "Acceptable, but still light for competitive content.";
    warnings.push({ field: "content", message });
  } else if (wordCount < rules.strongRangeMin) {
    status = "good";
    tierLabel = "Solid";
    message = "Solid article length.";
  } else if (wordCount <= rules.strongRangeMax) {
    status = "good";
    tierLabel = "Strong long-form range";
    message = "Strong long-form range.";
  } else {
    status = "warning";
    tierLabel = "Long";
    message = "Long article. Keep it useful and avoid bloat.";
    warnings.push({ field: "content", message });
  }

  if (wordCount >= 1200 && headingCount === 0) {
    const warning = "Long articles should include H2/H3/H4 headings.";
    warnings.push({ field: "headings", message: warning });
  } else if (wordCount >= 900 && headingCount < Math.floor(wordCount / rules.headingWordsInterval) - 1) {
    warnings.push({
      field: "headings",
      message: "Consider adding H2/H3/H4 headings about every 300 words.",
    });
  }

  if (longestParagraphWords >= 140) {
    warnings.push({
      field: "paragraphs",
      message: "One or more paragraphs are very long. Break up wall-of-text sections.",
    });
  }

  return {
    id: "content",
    label: "Article body",
    count: wordCount,
    headingCount,
    longestParagraphWords,
    recommendedText: "600+ words minimum; 1,500-2,500 strong",
    status,
    message,
    tierLabel,
    helper:
      "Minimum recommended for publish: 600+ words. Use H2/H3/H4 headings every ~300 words to keep content easy to scan.",
    hardErrors,
    warnings,
  };
}

export function analyzeBlogEditorContent(values = {}) {
  const metrics = {
    title: createLengthMetric({
      id: "title",
      label: "Blog title",
      value: values.title,
      ...BLOG_EDITOR_RULES.blogTitle,
      helper:
        "Recommended: 10-70 characters. Make it clear, clickable, and include the primary keyword naturally.",
    }),
    slug: analyzeSlug(values.slug),
    excerpt: createLengthMetric({
      id: "excerpt",
      label: "Excerpt",
      value: values.excerpt,
      ...BLOG_EDITOR_RULES.excerpt,
      helper: "Recommended: 150-170 characters. Use it as a teaser that makes users want to click.",
    }),
    seoTitle: createLengthMetric({
      id: "seoTitle",
      label: "SEO title",
      value: values.seoTitle,
      ...BLOG_EDITOR_RULES.seoTitle,
      helper: "Recommended: 50-60 characters. Keep the most important keyword near the beginning.",
    }),
    seoDescription: createLengthMetric({
      id: "seoDescription",
      label: "SEO description",
      value: values.seoDescription,
      ...BLOG_EDITOR_RULES.seoDescription,
      helper:
        "Recommended: 120-160 characters. Write a clear value proposition that encourages clicks.",
    }),
    body: analyzeBody(values.contentMarkdown),
  };

  const hardErrors = Object.values(metrics).flatMap((metric) => metric.hardErrors || []);
  const warnings = Object.values(metrics).flatMap((metric) => metric.warnings || []);

  return {
    metrics,
    hardErrors,
    warnings,
    readyToPublish: hardErrors.length === 0,
  };
}

export function validateBlogPostForPublish(values = {}, { duplicateSlug = false } = {}) {
  const analysis = analyzeBlogEditorContent(values);
  const hardErrors = [...analysis.hardErrors];
  const slug = analysis.metrics.slug.slug;

  if (duplicateSlug) {
    hardErrors.push({
      field: "slug",
      message: "Slug is already used by another blog post.",
    });
  }

  return {
    ...analysis,
    normalizedSlug: slug,
    hardErrors,
    readyToPublish: hardErrors.length === 0,
  };
}

export function formatPublishBlockerMessage(errors = []) {
  if (!errors.length) return "";
  return `Publish blocked:\n${errors.map((error) => `- ${error.message}`).join("\n")}`;
}
