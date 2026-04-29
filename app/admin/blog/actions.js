"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminPageAccess } from "@/lib/admin/access";
import {
  BLOG_CATEGORY_COLUMNS,
  BLOG_POST_COLUMNS,
  getBlogAdminDb,
  normalizeBlogCategoryFormData,
  normalizeBlogPostFormData,
  normalizeOptionalText,
} from "@/lib/blog/admin";
import { formatPublishBlockerMessage, validateBlogPostForPublish } from "@/lib/blog/editor-validation";

const BLOG_LIST_PATH = "/admin/blog";

async function getMutationContext() {
  const { supabase, user } = await requireAdminPageAccess();
  const db = getBlogAdminDb(supabase);
  if (!db?.from) {
    throw new Error("Blog admin requires a Supabase client.");
  }
  await ensureBlogAdminUser(db, user);
  return { db, user };
}

async function ensureBlogAdminUser(db, user) {
  const email = normalizeOptionalText(user?.email)?.toLowerCase();
  if (!user?.id || !email) return;

  const fullName =
    normalizeOptionalText(user?.user_metadata?.full_name) ||
    normalizeOptionalText(user?.user_metadata?.name) ||
    email;

  const payload = {
    id: user.id,
    user_id: user.id,
    email,
    full_name: fullName,
    role: "admin",
    is_active: true,
  };

  let { error } = await db.from("admin_users").upsert(payload, { onConflict: "id" });
  if (error && String(error.message || "").includes("user_id")) {
    const retry = await db.from("admin_users").upsert(
      {
        id: user.id,
        email,
        full_name: fullName,
        role: "admin",
        is_active: true,
      },
      { onConflict: "id" }
    );
    error = retry.error;
  }

  if (error) {
    throw new Error(error.message || "Failed to prepare blog admin profile.");
  }
}

function revalidateBlogAdmin(postId = null) {
  revalidatePath("/admin/blog");
  revalidatePath("/admin/blog/categories");
  revalidatePath("/admin/blog/subscribers");
  if (postId) revalidatePath(`/admin/blog/${postId}`);
}

function withActionError(error) {
  return {
    success: false,
    error: error?.message || "Blog action failed.",
  };
}

function toEditorValidationValues(post = {}) {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    contentMarkdown: post.content_markdown,
    seoTitle: post.seo_title,
    seoDescription: post.seo_description,
  };
}

async function hasDuplicateBlogSlug(db, slug, postId = null) {
  const normalizedSlug = normalizeOptionalText(slug);
  if (!normalizedSlug) return false;

  let query = db.from("blog_posts").select("id").eq("slug", normalizedSlug).limit(1);
  if (postId) query = query.neq("id", postId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Failed to validate blog slug.");
  return Array.isArray(data) && data.length > 0;
}

async function assertPublishReady(db, payload, postId = null) {
  const duplicateSlug = await hasDuplicateBlogSlug(db, payload.slug, postId);
  const validation = validateBlogPostForPublish(toEditorValidationValues(payload), { duplicateSlug });
  if (!validation.readyToPublish) {
    throw new Error(formatPublishBlockerMessage(validation.hardErrors));
  }
}

export async function saveBlogPostAction(_previousState, formData) {
  let savedId = null;
  try {
    const { db, user } = await getMutationContext();
    const postId = normalizeOptionalText(formData.get("id"));
    const payload = {
      ...normalizeBlogPostFormData(formData, { requireContent: false }),
      updated_by_admin_id: user.id,
    };

    if (payload.status === "published") {
      await assertPublishReady(db, payload, postId);
    }

    const query = postId
      ? db.from("blog_posts").update(payload).eq("id", postId)
      : db.from("blog_posts").insert({
          ...payload,
          created_by_admin_id: user.id,
        });

    const { data, error } = await query.select(BLOG_POST_COLUMNS).maybeSingle();
    if (error) throw new Error(error.message || "Failed to save blog post.");
    savedId = data?.id || postId;
  } catch (error) {
    return withActionError(error);
  }

  revalidateBlogAdmin(savedId);
  redirect(savedId ? `/admin/blog/${savedId}?saved=1` : BLOG_LIST_PATH);
}

export async function deleteBlogPostAction(formData) {
  const postId = normalizeOptionalText(formData.get("id"));
  if (!postId) throw new Error("Post id is required.");
  const { db } = await getMutationContext();
  const { error } = await db.from("blog_posts").delete().eq("id", postId);
  if (error) throw new Error(error.message || "Failed to delete blog post.");
  revalidateBlogAdmin(postId);
  redirect(BLOG_LIST_PATH);
}

export async function publishBlogPostAction(formData) {
  const postId = normalizeOptionalText(formData.get("id"));
  if (!postId) throw new Error("Post id is required.");
  const { db, user } = await getMutationContext();
  const { data: post, error: loadError } = await db
    .from("blog_posts")
    .select("id, title, slug, excerpt, content_markdown, seo_title, seo_description")
    .eq("id", postId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message || "Failed to load blog post.");

  await assertPublishReady(
    db,
    {
      title: post?.title,
      slug: post?.slug,
      excerpt: post?.excerpt,
      content_markdown: post?.content_markdown,
      seo_title: post?.seo_title,
      seo_description: post?.seo_description,
    },
    postId
  );

  const { error } = await db
    .from("blog_posts")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      unpublished_reason: null,
      image_check_status: null,
      image_check_error: null,
      image_checked_at: null,
      updated_by_admin_id: user.id,
    })
    .eq("id", postId);
  if (error) throw new Error(error.message || "Failed to publish blog post.");
  revalidateBlogAdmin(postId);
}

export async function unpublishBlogPostAction(formData) {
  const postId = normalizeOptionalText(formData.get("id"));
  if (!postId) throw new Error("Post id is required.");
  const { db, user } = await getMutationContext();
  const { error } = await db
    .from("blog_posts")
    .update({
      status: "unpublished",
      unpublished_reason: "Manually unpublished by an administrator.",
      updated_by_admin_id: user.id,
    })
    .eq("id", postId);
  if (error) throw new Error(error.message || "Failed to unpublish blog post.");
  revalidateBlogAdmin(postId);
}

export async function createBlogCategoryAction(_previousState, formData) {
  try {
    const { db } = await getMutationContext();
    const { error } = await db.from("blog_categories").insert(normalizeBlogCategoryFormData(formData));
    if (error) throw new Error(error.message || "Failed to create blog category.");
  } catch (error) {
    return withActionError(error);
  }
  revalidateBlogAdmin();
  return { success: true, error: null, message: "Category created." };
}

export async function updateBlogCategoryAction(formData) {
  const categoryId = normalizeOptionalText(formData.get("id"));
  if (!categoryId) throw new Error("Category id is required.");
  const { db } = await getMutationContext();
  const { error } = await db
    .from("blog_categories")
    .update(normalizeBlogCategoryFormData(formData))
    .eq("id", categoryId)
    .select(BLOG_CATEGORY_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to update blog category.");
  revalidateBlogAdmin();
}

export async function deleteBlogCategoryAction(formData) {
  const categoryId = normalizeOptionalText(formData.get("id"));
  if (!categoryId) throw new Error("Category id is required.");
  const { db } = await getMutationContext();
  const { error } = await db.from("blog_categories").delete().eq("id", categoryId);
  if (error) throw new Error(error.message || "Failed to delete blog category.");
  revalidateBlogAdmin();
}
