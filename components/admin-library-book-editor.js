"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLibraryBookEditor({ initialBook }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: initialBook.title || "",
    subtitle: initialBook.subtitle || "",
    authorDisplay: initialBook.authorDisplay || "",
    description: initialBook.description || "",
    cefrLevel: initialBook.cefrLevel || "",
    category: initialBook.category || "",
    tags: initialBook.tags.join(", "),
    coverUrl: initialBook.coverUrl || "",
    active: Boolean(initialBook.active),
  });
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function saveChanges() {
    setPending("save");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/library/books/${initialBook.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo actualizar el libro.");
      }
      setMessage("Book updated.");
    } catch (requestError) {
      setError(requestError?.message || "No se pudo actualizar el libro.");
    } finally {
      setPending("");
    }
  }

  async function recheckSource() {
    setPending("recheck");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/library/recheck/${initialBook.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: "book" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo revalidar el libro.");
      }
      setMessage("Source metadata refreshed.");
      if (payload?.record?.coverUrl) {
        setForm((previous) => ({ ...previous, coverUrl: payload.record.coverUrl }));
      }
    } catch (requestError) {
      setError(requestError?.message || "No se pudo revalidar el libro.");
    } finally {
      setPending("");
    }
  }

  async function archiveBook() {
    setPending("archive");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/library/books/${initialBook.id}/archive`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo archivar el libro.");
      }
      setForm((previous) => ({ ...previous, active: false }));
      setMessage("Book archived.");
    } catch (requestError) {
      setError(requestError?.message || "No se pudo archivar el libro.");
    } finally {
      setPending("");
    }
  }

  async function deleteBook() {
    setPending("delete");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/library/books/${initialBook.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo eliminar el libro.");
      }
      router.push("/admin/library");
      router.refresh();
    } catch (requestError) {
      setError(requestError?.message || "No se pudo eliminar el libro.");
    } finally {
      setPending("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Title</label>
          <input
            value={form.title}
            onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Subtitle</label>
          <input
            value={form.subtitle}
            onChange={(event) => setForm((previous) => ({ ...previous, subtitle: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Author</label>
          <input
            value={form.authorDisplay}
            onChange={(event) => setForm((previous) => ({ ...previous, authorDisplay: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Cover URL</label>
          <input
            value={form.coverUrl}
            onChange={(event) => setForm((previous) => ({ ...previous, coverUrl: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">CEFR</label>
          <input
            value={form.cefrLevel}
            onChange={(event) => setForm((previous) => ({ ...previous, cefrLevel: event.target.value.toUpperCase() }))}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Category</label>
          <input
            value={form.category}
            onChange={(event) => setForm((previous) => ({ ...previous, category: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Tags</label>
          <input
            value={form.tags}
            onChange={(event) => setForm((previous) => ({ ...previous, tags: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Description</label>
          <textarea
            value={form.description}
            onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
            rows={8}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-surface-2 p-4 text-sm text-foreground">
        <label className="inline-flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => setForm((previous) => ({ ...previous, active: event.target.checked }))}
            className="h-4 w-4"
          />
          Active
        </label>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveChanges}
          disabled={Boolean(pending)}
          className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "save" ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={recheckSource}
          disabled={Boolean(pending)}
          className="rounded-xl border border-primary/35 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "recheck" ? "Rechecking..." : "Recheck source"}
        </button>
        <button
          type="button"
          onClick={archiveBook}
          disabled={Boolean(pending)}
          className="rounded-xl border border-danger/40 px-4 py-3 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "archive" ? "Archiving..." : "Archive book"}
        </button>
        <button
          type="button"
          onClick={deleteBook}
          disabled={Boolean(pending)}
          className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger transition hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "delete" ? "Deleting..." : "Delete from library"}
        </button>
      </div>
    </div>
  );
}
