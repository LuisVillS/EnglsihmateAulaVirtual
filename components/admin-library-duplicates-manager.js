"use client";

import { useState } from "react";

function DuplicateRecord({ record, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        selected ? "border-primary bg-primary/8" : "border-border bg-surface hover:border-primary/25"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
          {record.recordScope === "book" ? "Publicado" : "Borrador"}
        </span>
        {record.readableOnline || record.readable_online ? (
          <span className="rounded-lg border border-success/35 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
            legible
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-base font-semibold text-foreground">{record.title || record.rawTitle}</h3>
      <p className="mt-1 text-sm text-muted">{record.authorDisplay || record.author_display || "Sin autor"}</p>
      <div className="mt-3 grid gap-1 text-xs text-muted">
        <p>Clave OpenLibrary: {record.openlibraryWorkKey || record.openlibrary_work_key || "N/A"}</p>
        <p>ID Archive: {record.internetArchiveIdentifier || record.internet_archive_identifier || "N/A"}</p>
        <p>Acceso: {record.ebookAccess || record.ebook_access || "N/A"}</p>
      </div>
      <span className="mt-4 inline-flex rounded-lg border border-border px-3 py-1 text-xs font-semibold text-foreground">
        {selected ? "Canonico elegido" : "Elegir como canonico"}
      </span>
    </button>
  );
}

function DuplicateGroupCard({ group, onResolved }) {
  const initialCanonicalId = group?.canonical?.id || group?.records?.[0]?.id || "";
  const [selectedId, setSelectedId] = useState(initialCanonicalId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function resolveGroup() {
    if (!selectedId || pending) return;

    setPending(true);
    setError("");

    try {
      const duplicateIds = [];
      const stagingIds = [];

      for (const record of group.records) {
        if (record.id === selectedId) continue;
        if (record.recordScope === "book") {
          duplicateIds.push(record.id);
        } else {
          stagingIds.push(record.id);
        }
      }

      const response = await fetch("/api/admin/library/dedupe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          canonicalId: selectedId,
          duplicateIds,
          stagingIds,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo resolver el grupo duplicado.");
      }

      onResolved(payload?.groups || []);
    } catch (requestError) {
      setError(requestError?.message || "No se pudo resolver el grupo duplicado.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Grupo duplicado</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">{group.groupKey}</h2>
        </div>
        <button
          type="button"
          onClick={resolveGroup}
          disabled={pending}
          className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Resolviendo..." : "Aplicar seleccion canonica"}
        </button>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {group.records.map((record) => (
          <DuplicateRecord
            key={`${record.recordScope}-${record.id}`}
            record={record}
            selected={selectedId === record.id}
            onSelect={() => setSelectedId(record.id)}
          />
        ))}
      </div>
    </article>
  );
}

export default function AdminLibraryDuplicatesManager({ initialGroups = [] }) {
  const [groups, setGroups] = useState(initialGroups);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function runScan() {
    if (pending) return;

    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/admin/library/dedupe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo recalcular duplicados.");
      }
      setGroups(payload?.groups || []);
    } catch (requestError) {
      setError(requestError?.message || "No se pudo recalcular duplicados.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Cola de resolucion</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">{groups.length} grupo(s) duplicado(s)</h1>
        </div>
        <button
          type="button"
          onClick={runScan}
          disabled={pending}
          className="rounded-xl border border-primary/35 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Escaneando..." : "Reescanear duplicados"}
        </button>
      </div>

      {error ? <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      {groups.length ? (
        <div className="space-y-5">
          {groups.map((group) => (
            <DuplicateGroupCard key={group.groupKey} group={group} onResolved={setGroups} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="text-lg font-semibold text-foreground">No se detectaron duplicados</p>
          <p className="mt-2 text-sm text-muted">Ejecuta un escaneo despues de importar o publicar nuevos libros.</p>
        </div>
      )}
    </div>
  );
}
