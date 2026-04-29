import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { normalizeEditableSlug } from "@/lib/blog/editor-validation";

export const BLOG_CATEGORY_COLUMNS = `
  id,
  name,
  slug,
  description,
  sort_order,
  is_active,
  created_at,
  updated_at
`;

export const BLOG_POST_COLUMNS = `
  id,
  title,
  slug,
  category_id,
  excerpt,
  cover_image_url,
  content_markdown,
  status,
  published_at,
  unpublished_reason,
  image_check_status,
  image_check_error,
  image_checked_at,
  seo_title,
  seo_description,
  created_by_admin_id,
  updated_by_admin_id,
  created_at,
  updated_at,
  category:blog_categories (
    id,
    name,
    slug
  )
`;

export const BLOG_SUBSCRIBER_COLUMNS = `
  id,
  email,
  source,
  lead_source,
  lead_type,
  status,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_term,
  utm_content,
  landing_url,
  page_path,
  referrer_url,
  subscribed_at,
  unsubscribed_at,
  created_at,
  updated_at
`;

export function getBlogAdminDb(fallbackClient = null) {
  return hasServiceRoleClient() ? getServiceSupabaseClient() : fallbackClient;
}

export function normalizeBlogSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function normalizeOptionalText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function normalizeStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "published" || normalized === "unpublished") return normalized;
  return "draft";
}

function normalizeDateTime(value) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeUrl(value) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  throw new Error("Image URLs must start with http:// or https://.");
}

export function normalizeBlogPostFormData(formData, { requireContent = true } = {}) {
  const title = normalizeOptionalText(formData.get("title"));
  const slug = normalizeOptionalText(normalizeEditableSlug(formData.get("slug") || title));
  const contentMarkdown = normalizeOptionalText(formData.get("content_markdown"));
  const status = normalizeStatus(formData.get("status"));
  const publishedAtInput = normalizeDateTime(formData.get("published_at"));

  if (status === "published" && !title) throw new Error("Title is required.");
  if (status === "published" && !slug) throw new Error("Slug is required.");
  if (requireContent && !contentMarkdown) throw new Error("Markdown content is required.");

  return {
    title,
    slug,
    category_id: normalizeOptionalText(formData.get("category_id")),
    excerpt: normalizeOptionalText(formData.get("excerpt")),
    cover_image_url: normalizeUrl(formData.get("cover_image_url")),
    content_markdown: contentMarkdown || "",
    status,
    published_at: status === "published" ? publishedAtInput || new Date().toISOString() : publishedAtInput,
    unpublished_reason: status === "unpublished" ? normalizeOptionalText(formData.get("unpublished_reason")) : null,
    image_check_status: status === "published" ? null : normalizeOptionalText(formData.get("image_check_status")),
    image_check_error: status === "published" ? null : normalizeOptionalText(formData.get("image_check_error")),
    image_checked_at: status === "published" ? null : normalizeDateTime(formData.get("image_checked_at")),
    seo_title: normalizeOptionalText(formData.get("seo_title")),
    seo_description: normalizeOptionalText(formData.get("seo_description")),
  };
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function parseImageUrl(value) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function extractBlogImageUrls(post = {}) {
  const candidates = [];
  const coverUrl = parseImageUrl(post.cover_image_url);
  if (coverUrl) candidates.push(coverUrl);

  const markdown = String(post.content_markdown || "");
  const imagePattern = /!\[[^\]]*]\(([^)\s]+)\)/g;
  for (const match of markdown.matchAll(imagePattern)) {
    const imageUrl = parseImageUrl(match[1]);
    if (imageUrl) candidates.push(imageUrl);
  }

  return uniqueValues(candidates);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(url, {
      ...options,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkImageUrl(url) {
  const parsedUrl = parseImageUrl(url);
  if (!parsedUrl) {
    return { ok: false, reason: "Invalid image URL." };
  }

  try {
    const headResponse = await fetchWithTimeout(parsedUrl, { method: "HEAD" });
    if (headResponse.ok) return { ok: true };
    if (headResponse.status !== 403 && headResponse.status !== 405) {
      return { ok: false, reason: `Image URL returned HTTP ${headResponse.status}.` };
    }

    const getResponse = await fetchWithTimeout(parsedUrl, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
    if (getResponse.ok || getResponse.status === 206) return { ok: true };
    return { ok: false, reason: `Image URL returned HTTP ${getResponse.status}.` };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "AbortError" ? "Image URL timed out." : "Image URL could not be reached.",
    };
  }
}

export async function checkBlogPostImages(post = {}) {
  const urls = extractBlogImageUrls(post);
  for (const url of urls) {
    const result = await checkImageUrl(url);
    if (!result.ok) {
      return {
        ok: false,
        url,
        reason: result.reason || "Image link error detected.",
      };
    }
  }

  return { ok: true, checked: urls.length };
}

export async function markPublishedPostsWithBrokenImages(db, posts = []) {
  const now = Date.now();
  const recheckMs = 6 * 60 * 60 * 1000;
  const changed = [];

  for (const post of posts) {
    if (post?.status !== "published") continue;
    const imageUrls = extractBlogImageUrls(post);
    if (!imageUrls.length) continue;

    const lastCheckedAt = post.image_checked_at ? new Date(post.image_checked_at).getTime() : 0;
    if (Number.isFinite(lastCheckedAt) && lastCheckedAt > 0 && now - lastCheckedAt < recheckMs) {
      continue;
    }

    const result = await checkBlogPostImages(post);
    if (result.ok) {
      await db
        .from("blog_posts")
        .update({
          image_check_status: "ok",
          image_check_error: null,
          image_checked_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      continue;
    }

    const reason = `${result.reason} Broken URL: ${result.url}`;
    const { error } = await db
      .from("blog_posts")
      .update({
        status: "unpublished",
        unpublished_reason: "Image link error detected. Update the broken image URL and publish again.",
        image_check_status: "broken",
        image_check_error: reason,
        image_checked_at: new Date().toISOString(),
      })
      .eq("id", post.id);

    if (!error) {
      changed.push({ ...post, status: "unpublished", image_check_error: reason });
    }
  }

  return changed;
}

export function normalizeBlogCategoryFormData(formData) {
  const name = normalizeOptionalText(formData.get("name"));
  const slug = normalizeBlogSlug(formData.get("slug") || name);
  if (!name) throw new Error("Category name is required.");
  if (!slug) throw new Error("Category slug is required.");

  const sortOrder = Number(formData.get("sort_order") || 0);
  return {
    name,
    slug,
    description: normalizeOptionalText(formData.get("description")),
    sort_order: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
}

export async function listBlogPostsForAdmin(db) {
  const { data, error } = await db
    .from("blog_posts")
    .select(BLOG_POST_COLUMNS)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load blog posts.");
  return Array.isArray(data) ? data : [];
}

export async function selectBlogPostForAdmin(db, postId) {
  if (!postId) return null;
  const { data, error } = await db
    .from("blog_posts")
    .select(BLOG_POST_COLUMNS)
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to load blog post.");
  return data || null;
}

export async function listBlogCategoriesForAdmin(db) {
  const { data, error } = await db
    .from("blog_categories")
    .select(BLOG_CATEGORY_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message || "Failed to load blog categories.");
  return Array.isArray(data) ? data : [];
}

export async function listBlogSubscribersForAdmin(db) {
  const { data, error } = await db
    .from("blog_subscribers")
    .select(BLOG_SUBSCRIBER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message || "Failed to load blog subscribers.");
  return Array.isArray(data) ? data : [];
}
