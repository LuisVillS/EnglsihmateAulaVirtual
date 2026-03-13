import { cleanText } from "../library/normalization.js";
import { FLIPBOOK_LAYOUT_SLUG } from "../flipbook-core/layout-profile.js";

function mapManifestRow(row = null) {
  if (!row) return null;
  return {
    id: row.id,
    libraryBookId: row.library_book_id,
    layoutProfileId: row.layout_profile_id,
    sourceFingerprint: row.source_fingerprint,
    sourceName: row.source_name || "",
    sourceHash: row.source_hash || "",
    manifestVersion: row.manifest_version || "",
    metadata: row.metadata_json || {},
    toc: Array.isArray(row.toc_json) ? row.toc_json : [],
    anchorMap: row.anchor_map_json || {},
    pageCount: Number(row.page_count) || 0,
    generatedAt: row.generated_at || null,
    pages: Array.isArray(row.pages)
      ? row.pages
          .map((page) => mapFlipbookPageRow(page))
          .sort((a, b) => a.pageIndex - b.pageIndex)
      : [],
  };
}

function mapFlipbookPageRow(page = null) {
  if (!page) return null;
  return {
    pageId: cleanText(page.page_id),
    pageIndex: Number(page.page_index) || 0,
    layoutProfileId: cleanText(page.layout_profile_id),
    chapterId: cleanText(page.chapter_id),
    sectionId: cleanText(page.section_id),
    startLocator: cleanText(page.start_locator),
    endLocator: cleanText(page.end_locator),
    html: page.html || "",
    textSegments: Array.isArray(page.text_segments_json) ? page.text_segments_json : [],
    flags: page.flags_json || {},
  };
}

function mapUserStateRow(row = null) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    libraryBookId: row.library_book_id,
    layoutProfileId: row.layout_profile_id || "",
    manifestId: row.manifest_id || "",
    currentPageId: row.current_page_id || "",
    currentPageIndex: row.current_page_index == null ? null : Number(row.current_page_index),
    savedPageId: row.saved_page_id || "",
    savedPageIndex: row.saved_page_index == null ? null : Number(row.saved_page_index),
    progressPercent: row.progress_percent == null ? null : Number(row.progress_percent),
    chapterId: row.chapter_id || "",
    startedReading: Boolean(row.started_reading),
    completed: Boolean(row.completed),
    lastOpenedAt: row.last_opened_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function getFlipbookLayoutProfileBySlug({ db, slug = FLIPBOOK_LAYOUT_SLUG } = {}) {
  const { data, error } = await db
    .from("library_flipbook_layout_profiles")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "No se pudo cargar el perfil del flipbook.");
  }
  return data || null;
}

export async function getFlipbookManifestByFingerprint({
  db,
  libraryBookId,
  sourceFingerprint,
  layoutProfileId,
  includePages = false,
} = {}) {
  const selectClause = includePages ? "*, pages:library_flipbook_pages(*)" : "*";
  const { data, error } = await db
    .from("library_flipbook_manifests")
    .select(selectClause)
    .eq("library_book_id", libraryBookId)
    .eq("source_fingerprint", sourceFingerprint)
    .eq("layout_profile_id", layoutProfileId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "No se pudo cargar el manifiesto del flipbook.");
  }
  return mapManifestRow(data);
}

export async function getFlipbookManifestById({ db, manifestId, includePages = false } = {}) {
  const safeManifestId = cleanText(manifestId);
  if (!safeManifestId) return null;

  const selectClause = includePages ? "*, pages:library_flipbook_pages(*)" : "*";
  const { data, error } = await db
    .from("library_flipbook_manifests")
    .select(selectClause)
    .eq("id", safeManifestId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "No se pudo cargar el manifiesto del flipbook.");
  }
  return mapManifestRow(data);
}

export async function replaceFlipbookManifest({
  db,
  libraryBookId,
  layoutProfileId,
  sourceFingerprint,
  sourceName = "",
  sourceHash = "",
  manifest,
  includePages = false,
} = {}) {
  const existing = await getFlipbookManifestByFingerprint({
    db,
    libraryBookId,
    sourceFingerprint,
    layoutProfileId,
    includePages: false,
  });

  if (existing?.id) {
    const { error: deletePagesError } = await db.from("library_flipbook_pages").delete().eq("manifest_id", existing.id);
    if (deletePagesError) {
      throw new Error(deletePagesError.message || "No se pudieron reemplazar las paginas del flipbook.");
    }
  }

  const { data: manifestRow, error: manifestError } = await db
    .from("library_flipbook_manifests")
    .upsert(
      {
        library_book_id: libraryBookId,
        layout_profile_id: layoutProfileId,
        source_fingerprint: sourceFingerprint,
        source_name: sourceName || null,
        source_hash: sourceHash,
        manifest_version: manifest.manifestVersion,
        metadata_json: manifest.metadata || {},
        toc_json: manifest.toc || [],
        anchor_map_json: manifest.anchorMap || {},
        page_count: Array.isArray(manifest.pages) ? manifest.pages.length : 0,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "library_book_id,layout_profile_id,source_fingerprint" }
    )
    .select("*")
    .maybeSingle();
  if (manifestError || !manifestRow?.id) {
    throw new Error(manifestError?.message || "No se pudo guardar el manifiesto del flipbook.");
  }

  const pagePayloads = (manifest.pages || []).map((page) => ({
    manifest_id: manifestRow.id,
    page_id: page.pageId,
    page_index: page.pageIndex,
    layout_profile_id: layoutProfileId,
    chapter_id: page.chapterId || null,
    section_id: page.sectionId || null,
    start_locator: page.startLocator || null,
    end_locator: page.endLocator || null,
    html: page.html,
    text_segments_json: page.textSegments || [],
    flags_json: page.flags || {},
    updated_at: new Date().toISOString(),
  }));
  if (pagePayloads.length) {
    const { error: pageError } = await db.from("library_flipbook_pages").insert(pagePayloads);
    if (pageError) {
      throw new Error(pageError.message || "No se pudieron guardar las paginas del flipbook.");
    }
  }

  return getFlipbookManifestByFingerprint({
    db,
    libraryBookId,
    sourceFingerprint,
    layoutProfileId,
    includePages,
  });
}

export async function listFlipbookPages({ db, manifestId, from = 0, to = 0 } = {}) {
  const safeFrom = Math.max(0, Number(from) || 0);
  const safeTo = Math.max(safeFrom, Number(to) || safeFrom);
  const { data, error } = await db
    .from("library_flipbook_pages")
    .select("*")
    .eq("manifest_id", manifestId)
    .range(safeFrom, safeTo)
    .order("page_index", { ascending: true });
  if (error) {
    throw new Error(error.message || "No se pudieron cargar las paginas del flipbook.");
  }
  return (data || []).map((page) => mapFlipbookPageRow(page)).filter(Boolean);
}

export async function getFlipbookUserState({ db, userId, libraryBookId } = {}) {
  const { data, error } = await db
    .from("library_flipbook_user_state")
    .select("*")
    .eq("user_id", userId)
    .eq("library_book_id", libraryBookId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "No se pudo cargar el estado del flipbook.");
  }
  return mapUserStateRow(data);
}

export async function upsertFlipbookUserState({
  db,
  userId,
  libraryBookId,
  layoutProfileId = null,
  manifestId = null,
  currentPageId = null,
  currentPageIndex = null,
  savedPageId = undefined,
  savedPageIndex = undefined,
  progressPercent = null,
  chapterId = null,
  startedReading = true,
  completed = false,
} = {}) {
  const existing = await getFlipbookUserState({ db, userId, libraryBookId });
  const payload = {
    user_id: userId,
    library_book_id: libraryBookId,
    layout_profile_id: layoutProfileId || existing?.layoutProfileId || null,
    manifest_id: manifestId || existing?.manifestId || null,
    current_page_id: currentPageId ?? existing?.currentPageId ?? null,
    current_page_index:
      currentPageIndex == null ? existing?.currentPageIndex ?? null : Math.max(0, Number(currentPageIndex) || 0),
    saved_page_id: savedPageId === undefined ? existing?.savedPageId || null : savedPageId || null,
    saved_page_index:
      savedPageIndex === undefined
        ? existing?.savedPageIndex ?? null
        : savedPageIndex == null
        ? null
        : Math.max(0, Number(savedPageIndex) || 0),
    progress_percent:
      progressPercent == null || progressPercent === ""
        ? existing?.progressPercent ?? null
        : Number(progressPercent),
    chapter_id: chapterId ?? existing?.chapterId ?? null,
    started_reading: startedReading ?? existing?.startedReading ?? false,
    completed: Boolean(completed),
    last_opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("library_flipbook_user_state")
    .upsert(payload, { onConflict: "user_id,library_book_id" })
    .select("*")
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "No se pudo guardar el estado del flipbook.");
  }
  return mapUserStateRow(data);
}
