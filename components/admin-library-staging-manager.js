"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

function HydrationSafeInput(props) {
  return <input suppressHydrationWarning {...props} />;
}

function HydrationSafeSelect(props) {
  return <select suppressHydrationWarning {...props} />;
}

function HydrationSafeButton({ type = "button", ...props }) {
  return <button suppressHydrationWarning type={type} {...props} />;
}

function StatusBadge({ label, tone = "neutral" }) {
  const toneClass =
    tone === "success"
      ? "border-success/35 bg-success/10 text-success"
      : tone === "danger"
        ? "border-danger/35 bg-danger/10 text-danger"
        : tone === "warning"
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-surface-2 text-muted";

  return <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{label}</span>;
}

function normalizeStatusTone(status) {
  if (status === "published" || status === "approved") return "success";
  if (status === "rejected" || status === "duplicate") return "danger";
  if (status === "needs_review") return "warning";
  return "neutral";
}

function StagingCard({ candidate, selected, onSelect, onUpdate }) {
  const [form, setForm] = useState({
    title: candidate.rawTitle || "",
    authorDisplay: candidate.authorDisplay || "",
    cefrLevel: candidate.cefrLevel || "",
    category: candidate.category || "",
    tags: candidate.tags.join(", "),
    coverUrl: candidate.coverUrl || "",
    uploadedEpubKey: candidate.uploadedEpubKey || "",
    uploadedEpubFileName: candidate.uploadedEpubFileName || "",
    uploadedEpubContentType: candidate.uploadedEpubContentType || "",
    uploadedEpubBytes: candidate.uploadedEpubBytes || null,
    rejectionReason: candidate.rejectionReason || "",
  });
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm({
      title: candidate.rawTitle || "",
      authorDisplay: candidate.authorDisplay || "",
      cefrLevel: candidate.cefrLevel || "",
      category: candidate.category || "",
      tags: candidate.tags.join(", "),
      coverUrl: candidate.coverUrl || "",
      uploadedEpubKey: candidate.uploadedEpubKey || "",
      uploadedEpubFileName: candidate.uploadedEpubFileName || "",
      uploadedEpubContentType: candidate.uploadedEpubContentType || "",
      uploadedEpubBytes: candidate.uploadedEpubBytes || null,
      rejectionReason: candidate.rejectionReason || "",
    });
  }, [candidate]);

  async function uploadEpub(file) {
    if (!file) return;

    setPendingAction("upload");
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("scope", "staging");
      formData.append("entityKey", candidate.id);
      const response = await fetch("/api/admin/library/upload-epub", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo subir el EPUB.");
      }

      const uploadedEpub = payload?.uploadedEpub || null;
      const nextForm = {
        ...form,
        uploadedEpubKey: uploadedEpub?.key || "",
        uploadedEpubFileName: uploadedEpub?.fileName || "",
        uploadedEpubContentType: uploadedEpub?.contentType || "",
        uploadedEpubBytes: uploadedEpub?.bytes ?? null,
      };
      setForm(nextForm);

      const saveResponse = await fetch(`/api/admin/library/staging/${candidate.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: nextForm.title,
          authorDisplay: nextForm.authorDisplay,
          cefrLevel: nextForm.cefrLevel,
          category: nextForm.category,
          tags: nextForm.tags,
          coverUrl: nextForm.coverUrl,
          uploadedEpub: {
            key: nextForm.uploadedEpubKey,
            fileName: nextForm.uploadedEpubFileName,
            contentType: nextForm.uploadedEpubContentType,
            bytes: nextForm.uploadedEpubBytes,
          },
          rejectionReason: nextForm.rejectionReason,
        }),
      });
      const savePayload = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) {
        throw new Error(savePayload?.error || "No se pudo guardar el EPUB en staging.");
      }

      onUpdate(savePayload?.stagingCandidate);
      setMessage(`EPUB uploaded and saved: ${uploadedEpub?.fileName || file.name}`);
    } catch (requestError) {
      setError(requestError?.message || "No se pudo subir el EPUB.");
    } finally {
      setPendingAction("");
    }
  }

  async function removeUploadedEpub() {
    const previousUpload = form.uploadedEpubKey;
    if (!previousUpload) return;

    setPendingAction("remove-upload");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/library/staging/${candidate.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          authorDisplay: form.authorDisplay,
          cefrLevel: form.cefrLevel,
          category: form.category,
          tags: form.tags,
          coverUrl: form.coverUrl,
          uploadedEpubKey: "",
          uploadedEpubFileName: "",
          uploadedEpubContentType: "",
          uploadedEpubBytes: null,
          rejectionReason: form.rejectionReason,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo quitar el EPUB.");
      }

      setForm((previous) => ({
        ...previous,
        uploadedEpubKey: "",
        uploadedEpubFileName: "",
        uploadedEpubContentType: "",
        uploadedEpubBytes: null,
      }));
      onUpdate(payload?.stagingCandidate);
      setMessage("Uploaded EPUB removed.");
    } catch (requestError) {
      setError(requestError?.message || "No se pudo quitar el EPUB.");
    } finally {
      setPendingAction("");
    }
  }

  async function saveChanges(nextChanges = {}) {
    setPendingAction("save");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/library/staging/${candidate.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          authorDisplay: form.authorDisplay,
          cefrLevel: form.cefrLevel,
          category: form.category,
          tags: form.tags,
          coverUrl: form.coverUrl,
          uploadedEpub: form.uploadedEpubKey
            ? {
                key: form.uploadedEpubKey,
                fileName: form.uploadedEpubFileName,
                contentType: form.uploadedEpubContentType,
                bytes: form.uploadedEpubBytes,
              }
            : null,
          rejectionReason: form.rejectionReason,
          ...nextChanges,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo guardar staging.");
      }
      onUpdate(payload?.stagingCandidate);
      setMessage("Staging updated.");
      return payload?.stagingCandidate || null;
    } catch (requestError) {
      setError(requestError?.message || "No se pudo guardar staging.");
      return null;
    } finally {
      setPendingAction("");
    }
  }

  async function publishCandidate() {
    setPendingAction("publish");
    setError("");
    setMessage("");

    try {
      const savedCandidate = await saveChanges();
      if (!savedCandidate?.id) {
        setPendingAction("");
        return;
      }

      setPendingAction("publish");
      const response = await fetch(`/api/admin/library/publish/${candidate.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          authorDisplay: form.authorDisplay,
          cefrLevel: form.cefrLevel,
          category: form.category,
          tags: form.tags,
          coverUrl: form.coverUrl,
          uploadedEpub: form.uploadedEpubKey
            ? {
                key: form.uploadedEpubKey,
                fileName: form.uploadedEpubFileName,
                contentType: form.uploadedEpubContentType,
                bytes: form.uploadedEpubBytes,
              }
            : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo publicar el libro.");
      }

      onUpdate({
        ...candidate,
        rawTitle: form.title,
        authorDisplay: form.authorDisplay,
        cefrLevel: form.cefrLevel,
        category: form.category,
        tags: form.tags.split(",").map((entry) => entry.trim()).filter(Boolean),
        coverUrl: form.coverUrl,
        uploadedEpubKey: form.uploadedEpubKey,
        uploadedEpubFileName: form.uploadedEpubFileName,
        uploadedEpubContentType: form.uploadedEpubContentType,
        uploadedEpubBytes: form.uploadedEpubBytes,
        ingestionStatus: "published",
        duplicateOfBookId: payload?.book?.id || candidate.duplicateOfBookId,
      });
      setMessage("Book published or merged into the catalog.");
    } catch (requestError) {
      setError(requestError?.message || "No se pudo publicar el libro.");
    } finally {
      setPendingAction("");
    }
  }

  async function recheckCandidate() {
    setPendingAction("recheck");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/library/recheck/${candidate.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: "staging" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo revalidar el candidato.");
      }
      if (payload?.record) {
        onUpdate(payload.record);
        setForm((previous) => ({
          ...previous,
          title: payload.record.rawTitle || previous.title,
          authorDisplay: payload.record.authorDisplay || previous.authorDisplay,
          coverUrl: payload.record.coverUrl || previous.coverUrl,
          uploadedEpubKey: payload.record.uploadedEpubKey || previous.uploadedEpubKey,
          uploadedEpubFileName: payload.record.uploadedEpubFileName || previous.uploadedEpubFileName,
          uploadedEpubContentType: payload.record.uploadedEpubContentType || previous.uploadedEpubContentType,
          uploadedEpubBytes: payload.record.uploadedEpubBytes ?? previous.uploadedEpubBytes,
        }));
      }
      setMessage("Source metadata refreshed.");
    } catch (requestError) {
      setError(requestError?.message || "No se pudo revalidar el candidato.");
    } finally {
      setPendingAction("");
    }
  }

  async function rejectCandidate() {
    await saveChanges({
      ingestionStatus: "rejected",
      rejectionReason: form.rejectionReason || "Rejected by admin review.",
    });
  }

  async function deleteCandidate() {
    setPendingAction("delete");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/library/staging/${candidate.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo eliminar el candidato.");
      }
      onUpdate({ ...candidate, _deleted: true });
    } catch (requestError) {
      setError(requestError?.message || "No se pudo eliminar el candidato.");
    } finally {
      setPendingAction("");
    }
  }

  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full gap-3 lg:w-32 lg:flex-col">
          <label className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2">
            <HydrationSafeInput type="checkbox" checked={selected} onChange={onSelect} className="h-4 w-4" />
          </label>
          <div className="flex h-40 flex-1 items-center justify-center rounded-xl bg-surface-2 p-2 lg:h-44 lg:flex-none">
            {form.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.coverUrl} alt={form.title} className="h-full w-full rounded-xl object-cover" />
            ) : (
              <span className="text-xs uppercase tracking-[0.2em] text-muted">No cover</span>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={candidate.languageCode || "unknown"} />
            <StatusBadge label={candidate.ebookAccess || "no access"} />
            <StatusBadge label={candidate.ingestionStatus} tone={normalizeStatusTone(candidate.ingestionStatus)} />
            {candidate.readableOnline ? <StatusBadge label="readable" tone="success" /> : null}
            {candidate.previewOnly ? <StatusBadge label="preview only" tone="danger" /> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Title</label>
              <HydrationSafeInput
                value={form.title}
                onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Author</label>
              <HydrationSafeInput
                value={form.authorDisplay}
                onChange={(event) => setForm((previous) => ({ ...previous, authorDisplay: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">CEFR</label>
              <HydrationSafeInput
                value={form.cefrLevel}
                onChange={(event) => setForm((previous) => ({ ...previous, cefrLevel: event.target.value.toUpperCase() }))}
                className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="A1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Category</label>
              <HydrationSafeInput
                value={form.category}
                onChange={(event) => setForm((previous) => ({ ...previous, category: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Tags</label>
              <HydrationSafeInput
                value={form.tags}
                onChange={(event) => setForm((previous) => ({ ...previous, tags: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="classic, exam-prep"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Cover URL</label>
              <HydrationSafeInput
                value={form.coverUrl}
                onChange={(event) => setForm((previous) => ({ ...previous, coverUrl: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Upload EPUB</label>
              <HydrationSafeInput
                type="file"
                accept=".epub,application/epub+zip"
                onChange={(event) => uploadEpub(event.target.files?.[0])}
                className="mt-2 block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground"
              />
              {form.uploadedEpubFileName ? (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground">
                  <span>{form.uploadedEpubFileName}</span>
                  <HydrationSafeButton
                    onClick={removeUploadedEpub}
                    disabled={Boolean(pendingAction)}
                    className="font-semibold text-danger"
                    aria-label="Remove uploaded EPUB"
                  >
                    X
                  </HydrationSafeButton>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">Upload an EPUB to make this the primary reader source.</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Rejection reason</label>
              <HydrationSafeInput
                value={form.rejectionReason}
                onChange={(event) => setForm((previous) => ({ ...previous, rejectionReason: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="Metadata is inconsistent"
              />
            </div>
          </div>

          <div className="grid gap-2 text-xs text-muted md:grid-cols-2">
            <p>Work: {candidate.openlibraryWorkKey || "N/A"}</p>
            <p>Edition: {candidate.openlibraryEditionKey || "N/A"}</p>
            <p>Archive: {candidate.internetArchiveIdentifier || "N/A"}</p>
            <p>Uploaded EPUB: {form.uploadedEpubFileName || "N/A"}</p>
            <p>Duplicate of: {candidate.duplicateOfBookId || "No duplicate selected"}</p>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}

          <div className="flex flex-wrap gap-2">
            <HydrationSafeButton
              onClick={() => saveChanges()}
              disabled={Boolean(pendingAction)}
              className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === "save" ? "Saving..." : "Save"}
            </HydrationSafeButton>
            <HydrationSafeButton
              onClick={publishCandidate}
              disabled={Boolean(pendingAction)}
              className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === "publish" ? "Publishing..." : "Save and publish"}
            </HydrationSafeButton>
            <HydrationSafeButton
              onClick={recheckCandidate}
              disabled={Boolean(pendingAction)}
              className="rounded-xl border border-primary/35 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === "recheck" ? "Rechecking..." : "Recheck"}
            </HydrationSafeButton>
            <HydrationSafeButton
              onClick={deleteCandidate}
              disabled={Boolean(pendingAction)}
              className="rounded-xl border border-danger/40 px-4 py-3 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === "delete" ? "Deleting..." : "Delete"}
            </HydrationSafeButton>
            <HydrationSafeButton
              onClick={rejectCandidate}
              disabled={Boolean(pendingAction)}
              className="rounded-xl border border-danger/40 px-4 py-3 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reject
            </HydrationSafeButton>
            {candidate.duplicateOfBookId ? (
              <Link
                href="/admin/library/duplicates"
                className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
              >
                Resolve duplicate
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AdminLibraryStagingManager({ initialCandidates = [] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkForm, setBulkForm] = useState({
    cefrLevel: "",
    category: "",
    tags: "",
  });
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [pendingBulk, setPendingBulk] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const filteredCandidates = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (status && candidate.ingestionStatus !== status) return false;
      if (!needle) return true;
      return [candidate.rawTitle, candidate.authorDisplay, candidate.category, candidate.ingestionStatus]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [candidates, deferredQuery, status]);

  const allVisibleSelected =
    filteredCandidates.length > 0 &&
    filteredCandidates.every((candidate) => selectedIds.includes(candidate.id));

  function updateCandidate(nextCandidate) {
    if (!nextCandidate?.id) return;
    if (nextCandidate._deleted) {
      setCandidates((previous) => previous.filter((candidate) => candidate.id !== nextCandidate.id));
      setSelectedIds((previous) => previous.filter((id) => id !== nextCandidate.id));
      return;
    }
    setCandidates((previous) =>
      previous.map((candidate) => (candidate.id === nextCandidate.id ? { ...candidate, ...nextCandidate } : candidate))
    );
  }

  function toggleCandidateSelection(id) {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]
    );
  }

  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? [] : filteredCandidates.map((candidate) => candidate.id));
  }

  async function applyBulkUpdate(changes) {
    if (!selectedIds.length || pendingBulk) return;

    setPendingBulk(true);
    setBulkError("");
    setBulkMessage("");

    try {
      const response = await fetch("/api/admin/library/bulk-update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "staging",
          ids: selectedIds,
          changes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo actualizar la seleccion.");
      }

      for (const row of payload?.updated || []) {
        updateCandidate(row);
      }
      setBulkMessage(`${payload?.updated?.length || 0} staging record(s) updated.`);
      if (payload?.errors?.length) {
        setBulkError(payload.errors.map((entry) => entry.error).join(" "));
      }
    } catch (requestError) {
      setBulkError(requestError?.message || "No se pudo actualizar la seleccion.");
    } finally {
      setPendingBulk(false);
    }
  }

  async function publishSelected() {
    if (!selectedIds.length || pendingBulk) return;

    setPendingBulk(true);
    setBulkError("");
    setBulkMessage("");

    try {
      const response = await fetch("/api/admin/library/publish-bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stagingIds: selectedIds,
          overrides: {
            cefrLevel: bulkForm.cefrLevel || undefined,
            category: bulkForm.category || undefined,
            tags: bulkForm.tags || undefined,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo publicar la seleccion.");
      }

      setCandidates((previous) =>
        previous.map((candidate) =>
          selectedIds.includes(candidate.id)
            ? {
                ...candidate,
                ingestionStatus: "published",
              }
            : candidate
        )
      );
      setSelectedIds([]);
      setBulkMessage(`${payload?.published?.length || 0} staging record(s) published.`);
      if (payload?.errors?.length) {
        setBulkError(payload.errors.map((entry) => entry.error).join(" "));
      }
    } catch (requestError) {
      setBulkError(requestError?.message || "No se pudo publicar la seleccion.");
    } finally {
      setPendingBulk(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Search staging</label>
            <HydrationSafeInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              placeholder="Title, author, status"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Status</label>
            <HydrationSafeSelect
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
            >
              <option value="">All statuses</option>
              {["pending", "needs_review", "duplicate", "approved", "published", "rejected"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </HydrationSafeSelect>
          </div>
        </div>
      </div>

      {filteredCandidates.length ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <HydrationSafeButton
              onClick={toggleSelectAll}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              {allVisibleSelected ? "Clear selection" : "Select all in view"}
            </HydrationSafeButton>
            <HydrationSafeInput
              value={bulkForm.cefrLevel}
              onChange={(event) => setBulkForm((previous) => ({ ...previous, cefrLevel: event.target.value.toUpperCase() }))}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm text-foreground"
              placeholder="Bulk CEFR"
            />
            <HydrationSafeInput
              value={bulkForm.category}
              onChange={(event) => setBulkForm((previous) => ({ ...previous, category: event.target.value }))}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm text-foreground"
              placeholder="Bulk category"
            />
            <HydrationSafeInput
              value={bulkForm.tags}
              onChange={(event) => setBulkForm((previous) => ({ ...previous, tags: event.target.value }))}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm text-foreground"
              placeholder="Bulk tags"
            />
            <HydrationSafeButton
              onClick={() =>
                applyBulkUpdate({
                  cefrLevel: bulkForm.cefrLevel || undefined,
                  category: bulkForm.category || undefined,
                  tags: bulkForm.tags || undefined,
                })
              }
              disabled={!selectedIds.length || pendingBulk}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Apply metadata
            </HydrationSafeButton>
            <HydrationSafeButton
              onClick={publishSelected}
              disabled={!selectedIds.length || pendingBulk}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Publish selected
            </HydrationSafeButton>
            <HydrationSafeButton
              onClick={() =>
                applyBulkUpdate({
                  ingestionStatus: "rejected",
                  rejectionReason: "Rejected in bulk review.",
                })
              }
              disabled={!selectedIds.length || pendingBulk}
              className="rounded-xl border border-danger/40 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reject selected
            </HydrationSafeButton>
            <Link
              href="/admin/library/duplicates"
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Merge duplicates
            </Link>
          </div>
          {bulkError ? <p className="mt-3 text-sm text-danger">{bulkError}</p> : null}
          {bulkMessage ? <p className="mt-3 text-sm text-success">{bulkMessage}</p> : null}
        </div>
      ) : null}

      {filteredCandidates.length ? (
        <div className="space-y-5">
          {filteredCandidates.map((candidate) => (
            <StagingCard
              key={candidate.id}
              candidate={candidate}
              selected={selectedIds.includes(candidate.id)}
              onSelect={() => toggleCandidateSelection(candidate.id)}
              onUpdate={updateCandidate}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="text-lg font-semibold text-foreground">No staging candidates match this view</p>
          <p className="mt-2 text-sm text-muted">Try another status filter or import new candidates first.</p>
        </div>
      )}
    </div>
  );
}
