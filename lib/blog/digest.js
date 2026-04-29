import { createHmac } from "node:crypto";
import { sendBrevoHtmlEmail } from "@/lib/brevo";
import { loadAdminStudentsExportRows } from "@/lib/admin-students";
import { constantTimeEqual, resolveCanonicalAppUrl } from "@/lib/security/env";

const DIGEST_TIMEZONE = "America/Lima";
const DIGEST_WEEKDAY_LABELS = {
  1: "monday",
  6: "saturday",
};
const DIGEST_ALLOWED_WEEKDAYS = new Set(Object.keys(DIGEST_WEEKDAY_LABELS).map(Number));
const BLOG_DIGEST_TAG = "blog-weekly-digest";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeAudienceEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFreeText(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function resolveDigestTimezone(env = process.env) {
  return String(env.BLOG_DIGEST_TIMEZONE || DIGEST_TIMEZONE).trim() || DIGEST_TIMEZONE;
}

function getLocalDateParts(value, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year || 0),
    month: Number(map.month || 0),
    day: Number(map.day || 0),
    weekdayShort: String(map.weekday || "").toLowerCase(),
  };
}

function weekdayIndexFromShortLabel(label) {
  if (label === "mon") return 1;
  if (label === "sat") return 6;
  if (label === "sun") return 0;
  if (label === "tue") return 2;
  if (label === "wed") return 3;
  if (label === "thu") return 4;
  if (label === "fri") return 5;
  return -1;
}

export function resolveWeeklyDigestSlot(now = new Date(), env = process.env) {
  const timeZone = resolveDigestTimezone(env);
  const localParts = getLocalDateParts(now, timeZone);
  const weekdayIndex = weekdayIndexFromShortLabel(localParts.weekdayShort);
  const localDate = `${localParts.year}-${String(localParts.month).padStart(2, "0")}-${String(localParts.day).padStart(2, "0")}`;
  const weekdayLabel = DIGEST_WEEKDAY_LABELS[weekdayIndex] || "other";

  return {
    timeZone,
    localDate,
    weekdayIndex,
    weekdayLabel,
    digestKey: `weekly-${localDate}-${weekdayLabel}`,
    isScheduledDay: DIGEST_ALLOWED_WEEKDAYS.has(weekdayIndex),
  };
}

function resolveBlogPublicBaseUrl(env = process.env) {
  return resolveCanonicalAppUrl({
    env,
    candidates: ["BLOG_PUBLIC_BASE_URL", "PUBLIC_BLOG_BASE_URL", "SITE_URL", "APP_URL"],
    label: "BLOG_PUBLIC_BASE_URL",
  });
}

function resolveAppBaseUrl(env = process.env) {
  return resolveCanonicalAppUrl({
    env,
    candidates: ["APP_URL", "SITE_URL"],
    label: "APP_URL",
  });
}

function resolveUnsubscribeSecret(env = process.env) {
  return String(env.BLOG_DIGEST_UNSUBSCRIBE_SECRET || env.CRON_SECRET || "").trim();
}

function buildUnsubscribeToken(email, env = process.env) {
  const secret = resolveUnsubscribeSecret(env);
  if (!secret) {
    throw new Error("Configura BLOG_DIGEST_UNSUBSCRIBE_SECRET o CRON_SECRET para generar bajas del digest.");
  }

  return createHmac("sha256", secret).update(normalizeAudienceEmail(email)).digest("hex");
}

export function verifyDigestUnsubscribeToken(email, token, env = process.env) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return false;
  const expected = buildUnsubscribeToken(email, env);
  return constantTimeEqual(normalizedToken, expected);
}

export function buildDigestUnsubscribeUrl(email, env = process.env) {
  const appBaseUrl = resolveAppBaseUrl(env);
  const url = new URL("/api/blog/subscribers/unsubscribe", appBaseUrl);
  url.searchParams.set("email", normalizeAudienceEmail(email));
  url.searchParams.set("token", buildUnsubscribeToken(email, env));
  return url.toString();
}

function formatDigestDate(value, timeZone) {
  const parsed = value instanceof Date ? value : new Date(value || Date.now());
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Intl.DateTimeFormat("es-PE", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(safeDate);
}

function buildPostUrl(post, env = process.env) {
  const baseUrl = resolveBlogPublicBaseUrl(env);
  return `${baseUrl}/blog/${encodeURIComponent(post.slug)}`;
}

function buildBlogIndexUrl(env = process.env) {
  return `${resolveBlogPublicBaseUrl(env)}/blog`;
}

function buildDigestSubject(posts = [], env = process.env) {
  const explicitSubject = String(env.BLOG_DIGEST_SUBJECT || "").trim();
  if (explicitSubject) return explicitSubject;
  if (posts.length === 1) {
    return `EnglishMate Blog: ${posts[0].title}`;
  }
  return `Novedades del blog EnglishMate: ${posts.length} artículos`;
}

function buildDigestIntro(posts = []) {
  if (posts.length === 1) {
    return "Ya está disponible un nuevo artículo de EnglishMate para ti.";
  }
  return "Aquí tienes los artículos más recientes publicados en el blog de EnglishMate.";
}

function buildDigestCardHtml(post, env = process.env) {
  const postUrl = buildPostUrl(post, env);
  const title = escapeHtml(post.title || "Artículo sin título");
  const category = escapeHtml(post.category?.name || "Blog EnglishMate");
  const publishedLabel = escapeHtml(
    formatDigestDate(post.published_at || post.created_at || new Date(), resolveDigestTimezone(env))
  );
  const imageUrl = normalizeFreeText(post.cover_image_url);

  const imageBlock = imageUrl
    ? `
      <td width="96" valign="middle" style="padding:0 0 0 18px;vertical-align:middle;">
        <img src="${escapeHtml(imageUrl)}" alt="${title}" width="96" style="display:block;width:96px;max-width:96px;height:auto;border:0;border-radius:8px;" />
      </td>
    `
    : "";

  return `
    <tr>
      <td style="padding:16px 0 20px 0;border-bottom:1px solid #e8e8e8;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="padding:0;vertical-align:middle;">
              <div style="font-family:Georgia, 'Times New Roman', serif;font-size:12px;line-height:18px;color:#6b7280;margin:0 0 10px 0;">
                ${category} | ${publishedLabel}
              </div>
              <div style="font-family:Arial, Helvetica, sans-serif;font-size:22px;line-height:28px;font-weight:700;color:#111111;margin:0;">
                <a href="${postUrl}" style="color:#111111;text-decoration:none;">${title}</a>
              </div>
            </td>
            ${imageBlock}
          </tr>
        </table>
      </td>
    </tr>
  `;
}

export function buildBlogDigestHtml({
  recipientName = "",
  posts = [],
  unsubscribeUrl = "",
  env = process.env,
} = {}) {
  const safeName = escapeHtml(normalizeFreeText(recipientName) || "hola");
  const intro = escapeHtml(buildDigestIntro(posts));
  const blogIndexUrl = buildBlogIndexUrl(env);
  const cardsHtml = posts.map((post) => buildDigestCardHtml(post, env)).join("");

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(buildDigestSubject(posts, env))}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f7f7f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f7f5;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:760px;background:#ffffff;">
            <tr>
              <td style="padding:40px 32px 20px 32px;">
                <div style="font-family:Georgia, 'Times New Roman', serif;font-size:56px;line-height:60px;font-weight:700;color:#111111;margin:0;">
                  Blog EnglishMate
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <div style="padding:6px 0;">
                  <div style="border-top:1px solid #d1d5db;font-size:0;line-height:0;">&nbsp;</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px 32px;">
                <div style="font-family:Arial, Helvetica, sans-serif;font-size:18px;line-height:28px;color:#111111;margin:0 0 8px 0;">
                  Hola ${safeName},
                </div>
                <div style="font-family:Arial, Helvetica, sans-serif;font-size:18px;line-height:28px;color:#4b5563;margin:0;">
                  ${intro}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${cardsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 36px 32px;">
                <a href="${blogIndexUrl}" style="display:inline-block;font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:14px;font-weight:700;color:#ffffff;text-decoration:none;background:#111111;border-radius:999px;padding:14px 20px;">
                  Ver todos los artículos
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <div style="padding:6px 0;">
                  <div style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 36px 32px;">
                <div style="font-family:Arial, Helvetica, sans-serif;font-size:12px;line-height:20px;color:#6b7280;margin:0 0 8px 0;">
                  Recibes este correo porque te suscribiste al blog de EnglishMate o compartiste tu correo con EnglishMate.
                </div>
                <div style="font-family:Arial, Helvetica, sans-serif;font-size:12px;line-height:20px;color:#6b7280;">
                  <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;">Darte de baja</a>
                  &nbsp;|&nbsp;
                  <a href="${blogIndexUrl}" style="color:#6b7280;">Ir al blog</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

export function buildBlogDigestText({
  recipientName = "",
  posts = [],
  unsubscribeUrl = "",
  env = process.env,
} = {}) {
  const greetingName = normalizeFreeText(recipientName) || "hola";
  const blogIndexUrl = buildBlogIndexUrl(env);
  const lines = [
    `Hola ${greetingName},`,
    "",
    buildDigestIntro(posts),
    "",
  ];

  for (const [index, post] of posts.entries()) {
    lines.push(`${index + 1}. ${normalizeFreeText(post.title) || "Artículo sin título"}`);
    if (post.category?.name) {
      lines.push(`Categoría: ${normalizeFreeText(post.category.name)}`);
    }
    lines.push(buildPostUrl(post, env));
    lines.push("");
  }

  lines.push(`Más artículos: ${blogIndexUrl}`);
  if (unsubscribeUrl) {
    lines.push(`Darte de baja: ${unsubscribeUrl}`);
  }
  return lines.join("\n");
}

async function loadDigestSubscribers(service) {
  const { data, error } = await service
    .from("blog_subscribers")
    .select("email, status, source, subscribed_at, unsubscribed_at")
    .not("email", "is", null);

  if (error) {
    throw new Error(error.message || "Failed to load blog subscribers.");
  }

  return Array.isArray(data) ? data : [];
}

async function loadDigestCrmLeads(service) {
  const { data, error } = await service
    .from("crm_leads")
    .select("email, full_name, lead_status, source_type, created_at, updated_at")
    .not("email", "is", null)
    .eq("lead_status", "open");

  if (error) {
    throw new Error(error.message || "Failed to load CRM digest audience.");
  }

  return Array.isArray(data) ? data : [];
}

async function loadDigestStudents(service) {
  const result = await loadAdminStudentsExportRows({ supabase: service });
  if (result?.error) {
    throw new Error(result.error.message || "Failed to load student digest audience.");
  }

  return Array.isArray(result?.students) ? result.students : [];
}

function mergeDigestCandidate(existing, candidate) {
  if (!existing) return candidate;

  const preferred = candidate.priority < existing.priority ? candidate : existing;
  return {
    ...existing,
    ...preferred,
    fullName: existing.fullName || candidate.fullName,
    sources: [...new Set([...(existing.sources || []), ...(candidate.sources || [])])],
    priority: Math.min(Number(existing.priority || 99), Number(candidate.priority || 99)),
  };
}

export async function buildBlogDigestAudience(service) {
  const [subscriberRows, crmRows, studentRows] = await Promise.all([
    loadDigestSubscribers(service),
    loadDigestCrmLeads(service),
    loadDigestStudents(service),
  ]);

  const unsubscribedEmails = new Set(
    subscriberRows
      .filter((row) => String(row.status || "").toLowerCase() === "unsubscribed")
      .map((row) => normalizeAudienceEmail(row.email))
      .filter(Boolean)
  );

  const merged = new Map();

  for (const row of subscriberRows) {
    const email = normalizeAudienceEmail(row.email);
    if (!email || unsubscribedEmails.has(email)) continue;
    if (String(row.status || "").toLowerCase() !== "subscribed") continue;

    merged.set(
      email,
      mergeDigestCandidate(merged.get(email), {
        email,
        fullName: "",
        preferredSource: "blog_subscriber",
        sources: ["blog_subscriber"],
        priority: 1,
      })
    );
  }

  for (const row of studentRows) {
    const email = normalizeAudienceEmail(row.email);
    if (!email || unsubscribedEmails.has(email)) continue;

    merged.set(
      email,
      mergeDigestCandidate(merged.get(email), {
        email,
        fullName: normalizeFreeText(row.full_name),
        preferredSource: "student",
        sources: ["student"],
        priority: 2,
      })
    );
  }

  for (const row of crmRows) {
    const email = normalizeAudienceEmail(row.email);
    if (!email || unsubscribedEmails.has(email)) continue;

    merged.set(
      email,
      mergeDigestCandidate(merged.get(email), {
        email,
        fullName: normalizeFreeText(row.full_name),
        preferredSource: "crm",
        sources: ["crm"],
        priority: 3,
      })
    );
  }

  return Array.from(merged.values())
    .sort((left, right) => left.email.localeCompare(right.email))
    .map(({ priority, ...recipient }) => recipient);
}

export async function listPublishedPostsForDigest(service, { since = null, limit = 5 } = {}) {
  let query = service
    .from("blog_posts")
    .select(`
      id,
      title,
      slug,
      excerpt,
      cover_image_url,
      published_at,
      created_at,
      seo_description,
      category:blog_categories (
        name,
        slug
      )
    `)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(Math.max(1, limit));

  if (since) {
    query = query.gt("published_at", since);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to load digest blog posts.");
  }

  return Array.isArray(data) ? data.filter((post) => post?.slug) : [];
}

async function findExistingDigestRun(service, digestKey) {
  const { data, error } = await service
    .from("blog_digest_runs")
    .select("*")
    .eq("digest_key", digestKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to inspect previous blog digest run.");
  }

  return data || null;
}

async function findLatestSuccessfulDigestRun(service) {
  const { data, error } = await service
    .from("blog_digest_runs")
    .select("*")
    .eq("status", "sent")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load latest successful blog digest run.");
  }

  return data || null;
}

async function insertDigestRun(service, payload) {
  const { data, error } = await service
    .from("blog_digest_runs")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to create blog digest run.");
  }

  return data;
}

async function updateDigestRun(service, runId, payload) {
  const { data, error } = await service
    .from("blog_digest_runs")
    .update(payload)
    .eq("id", runId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update blog digest run.");
  }

  return data;
}

async function sendDigestToRecipients(recipients, posts, env = process.env, { dryRun = false } = {}) {
  const subject = buildDigestSubject(posts, env);
  const blogIndexUrl = buildBlogIndexUrl(env);
  const results = [];

  for (const recipient of recipients) {
    const unsubscribeUrl = buildDigestUnsubscribeUrl(recipient.email, env);
    const displayName = recipient.fullName || recipient.email;
    const htmlContent = buildBlogDigestHtml({
      recipientName: displayName,
      posts,
      unsubscribeUrl,
      env,
    });
    const textContent = buildBlogDigestText({
      recipientName: displayName,
      posts,
      unsubscribeUrl,
      env,
    });

    if (dryRun) {
      results.push({ email: recipient.email, ok: true, dryRun: true });
      continue;
    }

    try {
      await sendBrevoHtmlEmail({
        toEmail: recipient.email,
        toName: displayName,
        subject,
        htmlContent,
        textContent,
        tags: [BLOG_DIGEST_TAG, ...recipient.sources],
      });
      results.push({ email: recipient.email, ok: true });
    } catch (error) {
      results.push({
        email: recipient.email,
        ok: false,
        error: error instanceof Error ? error.message : String(error || "Unknown digest delivery error."),
      });
    }
  }

  return {
    subject,
    blogIndexUrl,
    results,
  };
}

export async function markDigestSubscriberUnsubscribed(service, email, source = "blog_digest") {
  const normalizedEmail = normalizeAudienceEmail(email);
  if (!normalizedEmail) {
    throw new Error("A valid email is required to unsubscribe.");
  }

  const nowIso = new Date().toISOString();
  const { data: existing, error: loadError } = await service
    .from("blog_subscribers")
    .select("id, email, source, lead_source, lead_type, status")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (loadError && !String(loadError.message || "").toLowerCase().includes("no rows")) {
    throw new Error(loadError.message || "Failed to load subscriber for unsubscribe.");
  }

  if (existing?.id) {
    const { error } = await service
      .from("blog_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message || "Failed to update subscriber status.");
    }

    return { email: normalizedEmail, status: "unsubscribed", created: false };
  }

  const { error } = await service.from("blog_subscribers").insert({
    email: normalizedEmail,
    source,
    lead_source: "blog",
    lead_type: "blog",
    status: "unsubscribed",
    subscribed_at: nowIso,
    unsubscribed_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (error) {
    throw new Error(error.message || "Failed to insert unsubscribe suppression row.");
  }

  return { email: normalizedEmail, status: "unsubscribed", created: true };
}

export async function runWeeklyBlogDigest({
  service,
  env = process.env,
  now = new Date(),
  force = false,
  dryRun = false,
} = {}) {
  if (!service?.from) {
    throw new Error("Weekly blog digest requires a service Supabase client.");
  }

  const slot = resolveWeeklyDigestSlot(now, env);
  if (!force && !slot.isScheduledDay) {
    return {
      ok: true,
      skipped: true,
      reason: "outside-schedule",
      slot,
    };
  }

  const existingRun = await findExistingDigestRun(service, slot.digestKey);
  if (existingRun?.status === "sent") {
    return {
      ok: true,
      skipped: true,
      reason: "already-sent",
      slot,
      runId: existingRun.id,
    };
  }

  const latestSuccessfulRun = await findLatestSuccessfulDigestRun(service);
  const nowIso = now.toISOString();
  const digestRun = existingRun?.id
    ? existingRun
    : await insertDigestRun(service, {
        digest_key: slot.digestKey,
        digest_kind: "weekly",
        local_date: slot.localDate,
        weekday_label: slot.weekdayLabel,
        status: "pending",
        source_window_start: latestSuccessfulRun?.completed_at || null,
        source_window_end: nowIso,
        post_count: 0,
        recipient_count: 0,
        sent_count: 0,
        failed_count: 0,
        created_at: nowIso,
      });

  const postLimit = Math.max(1, Number(env.BLOG_DIGEST_POST_LIMIT || 5) || 5);
  const posts = await listPublishedPostsForDigest(service, {
    since: latestSuccessfulRun?.completed_at || null,
    limit: postLimit,
  });

  if (!posts.length) {
    await updateDigestRun(service, digestRun.id, {
      status: "skipped",
      reason: "no-new-posts",
      source_window_end: nowIso,
      post_count: 0,
      recipient_count: 0,
      sent_count: 0,
      failed_count: 0,
      payload: { reason: "no-new-posts" },
      completed_at: nowIso,
      updated_at: nowIso,
    });
    return {
      ok: true,
      skipped: true,
      reason: "no-new-posts",
      slot,
      runId: digestRun.id,
    };
  }

  const recipients = await buildBlogDigestAudience(service);
  if (!recipients.length) {
    await updateDigestRun(service, digestRun.id, {
      status: "skipped",
      reason: "no-recipients",
      source_window_end: nowIso,
      post_count: posts.length,
      post_ids: posts.map((post) => post.id),
      recipient_count: 0,
      sent_count: 0,
      failed_count: 0,
      payload: {
        reason: "no-recipients",
        post_ids: posts.map((post) => post.id),
      },
      completed_at: nowIso,
      updated_at: nowIso,
    });
    return {
      ok: true,
      skipped: true,
      reason: "no-recipients",
      slot,
      runId: digestRun.id,
      postCount: posts.length,
    };
  }

  const delivery = await sendDigestToRecipients(recipients, posts, env, { dryRun });
  const sentCount = delivery.results.filter((item) => item.ok).length;
  const failed = delivery.results.filter((item) => !item.ok);
  const failedCount = failed.length;
  const finalStatus = dryRun ? "skipped" : failedCount >= recipients.length ? "failed" : "sent";
  const finalReason = dryRun ? "dry-run" : failedCount ? "partial-failures" : null;

  await updateDigestRun(service, digestRun.id, {
    status: finalStatus,
    reason: finalReason,
    source_window_end: nowIso,
    post_count: posts.length,
    post_ids: posts.map((post) => post.id),
    recipient_count: recipients.length,
    sent_count: sentCount,
    failed_count: failedCount,
    payload: {
      subject: delivery.subject,
      blog_index_url: delivery.blogIndexUrl,
      recipients: recipients.map((recipient) => ({
        email: recipient.email,
        sources: recipient.sources,
      })),
      failures: failed,
    },
    completed_at: nowIso,
    updated_at: nowIso,
  });

  return {
    ok: true,
    skipped: false,
    dryRun,
    slot,
    runId: digestRun.id,
    subject: delivery.subject,
    postCount: posts.length,
    recipientCount: recipients.length,
    sentCount,
    failedCount,
    failures: failed,
  };
}
