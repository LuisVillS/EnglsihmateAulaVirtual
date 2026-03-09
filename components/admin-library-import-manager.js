"use client";

import { useMemo, useState } from "react";

function candidateId(candidate) {
  return candidate.openlibrary_edition_key || candidate.openlibrary_work_key || candidate.normalized_title;
}

function CandidateBadge({ label, tone = "neutral" }) {
  const toneClass =
    tone === "success"
      ? "border-success/35 bg-success/10 text-success"
      : tone === "danger"
        ? "border-danger/35 bg-danger/10 text-danger"
        : tone === "warning"
          ? "border-primary/35 bg-primary/10 text-primary"
          : "border-border bg-surface-2 text-muted";

  return <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{label}</span>;
}

function PreviewModal({ preview, loading, error, onClose }) {
  if (!preview && !loading && !error) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Source preview</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              {preview?.title || (loading ? "Loading preview..." : "Preview unavailable")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Close
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="border-b border-border bg-surface-2 p-5 lg:border-b-0 lg:border-r">
            {loading ? (
              <p className="text-sm text-muted">Loading source metadata...</p>
            ) : error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex aspect-[4/5] items-center justify-center rounded-xl bg-surface p-4">
                  {preview?.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.coverUrl} alt={preview.title} className="h-full w-full rounded-xl object-cover shadow-lg shadow-black/10" />
                  ) : (
                    <span className="text-xs uppercase tracking-[0.24em] text-muted">No cover</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <CandidateBadge label={preview?.languageCode || "unknown language"} />
                  <CandidateBadge
                    label={preview?.readableOnline ? "readable" : "not readable"}
                    tone={preview?.readableOnline ? "success" : "danger"}
                  />
                  <CandidateBadge label={preview?.ebookAccess || "no access"} />
                </div>

                <div className="space-y-2 text-sm text-muted">
                  <p><span className="font-semibold text-foreground">Author:</span> {preview?.authorDisplay || "Unknown author"}</p>
                  <p><span className="font-semibold text-foreground">Work:</span> {preview?.workKey || "N/A"}</p>
                  <p><span className="font-semibold text-foreground">Edition:</span> {preview?.editionKey || "N/A"}</p>
                  <p><span className="font-semibold text-foreground">Archive:</span> {preview?.internetArchiveIdentifier || "N/A"}</p>
                </div>

                {preview?.duplicateWarning?.hasDuplicate ? (
                  <div className="rounded-xl border border-primary/25 bg-primary/8 p-4 text-sm text-foreground">
                    <p className="font-semibold">Possible duplicate already in catalog</p>
                    <p className="mt-1 text-muted">
                      {preview.duplicateWarning.existingBooks.length} published match(es), {preview.duplicateWarning.stagingMatches.length} staging match(es)
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-4 p-5">
            {preview?.embedUrl ? (
              <iframe
                src={preview.embedUrl}
                title={`${preview.title} preview`}
                className="min-h-[56vh] w-full rounded-xl border border-border bg-white"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <div className="flex min-h-[56vh] items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 px-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-foreground">Embedded preview unavailable</p>
                  <p className="mt-2 text-sm text-muted">
                    Metadata preview is still available, but this source record does not currently expose an embeddable reader.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLibraryImportManager() {
  const [query, setQuery] = useState("");
  const [searchLimit, setSearchLimit] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkForm, setBulkForm] = useState({
    cefrLevel: "",
    category: "",
    tags: "",
  });
  const [previewState, setPreviewState] = useState({
    loading: false,
    error: "",
    preview: null,
  });

  const selectedCount = selectedIds.length;
  const allVisibleSelected = useMemo(
    () => candidates.length > 0 && selectedIds.length === candidates.length,
    [candidates.length, selectedIds.length]
  );

  async function handleSearch(event) {
    event.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError("");
    setMessage("");
    setSelectedIds([]);

    try {
      const response = await fetch("/api/admin/library/search-openlibrary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit: searchLimit }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo consultar Open Library.");
      }

      setCandidates(Array.isArray(payload?.candidates) ? payload.candidates : []);
      setMessage(`${payload?.total || 0} readable result(s) loaded from Open Library.`);
    } catch (requestError) {
      setError(requestError?.message || "No se pudo consultar Open Library.");
    } finally {
      setLoading(false);
    }
  }

  function toggleCandidateSelection(id) {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]
    );
  }

  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? [] : candidates.map((candidate) => candidateId(candidate)));
  }

  async function openPreview(candidate) {
    setPreviewState({
      loading: true,
      error: "",
      preview: null,
    });

    try {
      const response = await fetch("/api/admin/library/preview-source", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ candidate }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo cargar la vista previa.");
      }

      setPreviewState({
        loading: false,
        error: "",
        preview: payload?.preview || null,
      });
    } catch (requestError) {
      setPreviewState({
        loading: false,
        error: requestError?.message || "No se pudo cargar la vista previa.",
        preview: null,
      });
    }
  }

  function closePreview() {
    setPreviewState({
      loading: false,
      error: "",
      preview: null,
    });
  }

  function applyImportedState(imported = []) {
    setCandidates((previous) =>
      previous.map((candidate) => {
        const match = imported.find((row) => {
          const sameEdition =
            row.openlibraryEditionKey &&
            row.openlibraryEditionKey === candidate.openlibrary_edition_key;
          const sameWork = row.openlibraryWorkKey && row.openlibraryWorkKey === candidate.openlibrary_work_key;
          return sameEdition || sameWork;
        });

        if (!match) return candidate;
        return {
          ...candidate,
          imported: true,
          publish_status: match.publishStatus || "published",
          publishedBookId: match.id,
          slug: match.slug || "",
        };
      })
    );
  }

  function updateCandidateUploadedEpub(id, uploadedEpub) {
    setCandidates((previous) =>
      previous.map((candidate) =>
        candidateId(candidate) === id
          ? {
              ...candidate,
              uploadedEpubKey: uploadedEpub?.key || "",
              uploadedEpubFileName: uploadedEpub?.fileName || "",
              uploadedEpubContentType: uploadedEpub?.contentType || "",
              uploadedEpubBytes: uploadedEpub?.bytes ?? null,
            }
          : candidate
      )
    );
  }

  async function uploadCandidateEpub(id, file) {
    if (!file) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("scope", "candidate");
      formData.append("entityKey", id);

      const response = await fetch("/api/admin/library/upload-epub", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo subir el EPUB.");
      }

      updateCandidateUploadedEpub(id, payload?.uploadedEpub || null);
      setMessage(`EPUB uploaded: ${payload?.uploadedEpub?.fileName || file.name}`);
    } catch (requestError) {
      setError(requestError?.message || "No se pudo subir el EPUB.");
    } finally {
      setLoading(false);
    }
  }

  async function removeCandidateEpub(id, uploadedEpubKey) {
    if (!uploadedEpubKey) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/library/upload-epub", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: uploadedEpubKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo quitar el EPUB.");
      }

      updateCandidateUploadedEpub(id, null);
      setMessage("Uploaded EPUB removed.");
    } catch (requestError) {
      setError(requestError?.message || "No se pudo quitar el EPUB.");
    } finally {
      setLoading(false);
    }
  }

  async function importSelected({ reject = false, explicitCandidates = null } = {}) {
    const selectedCandidates = Array.isArray(explicitCandidates)
      ? explicitCandidates
      : candidates.filter((candidate) => selectedIds.includes(candidateId(candidate)));
    if (!selectedCandidates.length || loading) return;

    if (reject) {
      const rejectedIds = new Set(selectedCandidates.map((candidate) => candidateId(candidate)));
      setCandidates((previous) => previous.filter((candidate) => !rejectedIds.has(candidateId(candidate))));
      setSelectedIds([]);
      setError("");
      setMessage(`${selectedCandidates.length} selected title(s) removed from this import view.`);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/library/import-bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidates: selectedCandidates,
          overrides: {
            cefrLevel: bulkForm.cefrLevel || undefined,
            category: bulkForm.category || undefined,
            tags: bulkForm.tags || undefined,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo procesar la seleccion.");
      }

      applyImportedState(payload?.imported || []);
      setSelectedIds([]);
      setMessage(`${payload?.imported?.length || 0} selected title(s) published to the library.`);
      if (payload?.errors?.length) {
        setError(payload.errors.map((entry) => entry.error).join(" "));
      }
    } catch (requestError) {
      setError(requestError?.message || "No se pudo procesar la seleccion.");
    } finally {
      setLoading(false);
    }
  }

  async function importOne(candidate) {
    await importSelected({ explicitCandidates: [candidate] });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px_180px]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Search Open Library</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              placeholder="Pride and Prejudice"
            />
            <p className="mt-2 text-sm text-muted">
              Admin-only discovery. Search results are limited to readable candidates, and students never search Open Library directly from the classroom.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Results</label>
            <select
              value={searchLimit}
              onChange={(event) => setSearchLimit(Number(event.target.value) || 24)}
              className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
            >
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={36}>36</option>
              <option value={48}>48</option>
              <option value={60}>60</option>
            </select>
            <p className="mt-2 text-sm text-muted">Choose how many Open Library candidates to load.</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {candidates.length ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              {allVisibleSelected ? "Clear selection" : "Select all on page"}
            </button>
            <input
              value={bulkForm.cefrLevel}
              onChange={(event) => setBulkForm((previous) => ({ ...previous, cefrLevel: event.target.value.toUpperCase() }))}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm text-foreground"
              placeholder="Bulk CEFR"
            />
            <input
              value={bulkForm.category}
              onChange={(event) => setBulkForm((previous) => ({ ...previous, category: event.target.value }))}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm text-foreground"
              placeholder="Bulk category"
            />
            <input
              value={bulkForm.tags}
              onChange={(event) => setBulkForm((previous) => ({ ...previous, tags: event.target.value }))}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm text-foreground"
              placeholder="Bulk tags"
            />
            <button
              type="button"
              onClick={() => importSelected()}
              disabled={!selectedCount || loading}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Publish selected ({selectedCount})
            </button>
            <button
              type="button"
              onClick={() => importSelected({ reject: true })}
              disabled={!selectedCount || loading}
              className="rounded-xl border border-danger/40 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove selected
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{message}</div>
      ) : null}

      {candidates.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {candidates.map((candidate) => {
            const id = candidateId(candidate);
            const duplicateWarning = candidate.duplicateWarning;
            return (
              <article key={id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <div className="relative flex aspect-[5/4] items-center justify-center bg-surface-2 p-4">
                  <label className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/95">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(id)}
                      onChange={() => toggleCandidateSelection(id)}
                      className="h-4 w-4"
                    />
                  </label>
                  {candidate.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={candidate.cover_url}
                      alt={candidate.title}
                      className="h-full w-full rounded-xl object-cover shadow-lg shadow-black/10"
                    />
                  ) : (
                    <span className="text-xs uppercase tracking-[0.25em] text-muted">No cover</span>
                  )}
                </div>

                <div className="space-y-4 border-t border-border px-5 py-5">
                  <div className="flex flex-wrap gap-2">
                    <CandidateBadge label={candidate.language_code || "unknown language"} />
                    <CandidateBadge
                      label={candidate.readable_online ? "readable" : "not readable"}
                      tone={candidate.readable_online ? "success" : "danger"}
                    />
                    <CandidateBadge label={candidate.ebook_access || "no access"} />
                    {duplicateWarning?.hasDuplicate ? (
                      <CandidateBadge label="possible duplicate" tone="warning" />
                    ) : null}
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{candidate.title}</h2>
                    <p className="mt-1 text-sm text-muted">{candidate.author_display || "Unknown author"}</p>
                  </div>

                  <dl className="grid gap-2 text-xs text-muted">
                    <div>
                      <dt className="font-semibold text-foreground">Work key</dt>
                      <dd>{candidate.openlibrary_work_key || "N/A"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-foreground">Edition key</dt>
                      <dd>{candidate.openlibrary_edition_key || "N/A"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-foreground">Archive identifier</dt>
                      <dd>{candidate.internet_archive_identifier || "N/A"}</dd>
                    </div>
                  </dl>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                      EPUB upload
                    </label>
                    <input
                      type="file"
                      accept=".epub,application/epub+zip"
                      onChange={(event) => uploadCandidateEpub(id, event.target.files?.[0])}
                      className="mt-2 block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground"
                    />
                    {candidate.uploadedEpubFileName ? (
                      <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground">
                        <span>{candidate.uploadedEpubFileName}</span>
                        <button
                          type="button"
                          onClick={() => removeCandidateEpub(id, candidate.uploadedEpubKey)}
                          className="font-semibold text-danger"
                          aria-label="Remove uploaded EPUB"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        Upload an EPUB if you want this book to use your internal reader immediately.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openPreview(candidate)}
                      className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => importOne(candidate)}
                      disabled={loading}
                      className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {candidate.imported ? "Published" : "Publish"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="text-lg font-semibold text-foreground">No search results yet</p>
          <p className="mt-2 text-sm text-muted">Run an admin search to preview and publish readable candidates.</p>
        </div>
      )}

      <PreviewModal
        preview={previewState.preview}
        loading={previewState.loading}
        error={previewState.error}
        onClose={closePreview}
      />
    </div>
  );
}
