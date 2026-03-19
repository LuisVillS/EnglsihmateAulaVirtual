"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { AdminBadge, AdminEmptyState, AdminSectionHeader } from "@/components/admin-page";
import AppModal from "@/components/app-modal";
import { refreshDiscordUsernamesAction, saveDiscordRosterLinkAction } from "@/app/admin/discord/actions";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function buildSearchText(row) {
  return [
    row.displayName,
    row.username,
    row.linkedStudent?.full_name,
    row.linkedStudent?.email,
    row.linkedStudent?.discord_username,
    row.expectedRole,
    ...(row.currentRoles || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderRoleList(roleNames) {
  if (!roleNames.length) return <span className="text-[#94a3b8]">Sin roles</span>;
  return roleNames.map((roleName) => {
    const isManagedRole = roleName === "Alumni" || /\d{4}-\d{2}$/i.test(roleName);
    return (
      <AdminBadge key={roleName} tone={isManagedRole ? "accent" : "neutral"}>
        {roleName}
      </AdminBadge>
    );
  });
}

function EditDiscordLinkModal({ row, open, onClose }) {
  if (!row) return null;

  return (
    <AppModal open={open} onClose={onClose} title="Editar vinculacion de Discord" widthClass="max-w-2xl">
      <div className="space-y-4">
        <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Miembro de Discord</p>
          <p className="mt-2 text-lg font-semibold text-[#111827]">{row.displayName}</p>
          <p className="mt-1 text-sm text-[#64748b]">@{row.username || "sin-username"}</p>
        </div>

        <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4 text-sm text-[#475569]">
          <p className="font-semibold text-[#111827]">Que hace esta edicion</p>
          <p className="mt-2">
            Esta accion actualiza que estudiante queda vinculado a esta cuenta de Discord. El correo del estudiante se
            sigue cambiando desde su perfil o desde la gestion de alumnos.
          </p>
        </div>

        <form action={saveDiscordRosterLinkAction} className="space-y-4">
          <input type="hidden" name="discordUserId" value={row.discordUserId} />
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              Correo del estudiante
            </label>
            <input
              type="email"
              name="email"
              defaultValue={row.linkedStudent?.email || ""}
              placeholder="alumno@email.com"
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[#94a3b8]">Rol esperado</p>
              <p className="mt-2 text-sm font-semibold text-[#111827]">{row.expectedRole || "Sin rol gestionado"}</p>
            </div>
            <div className="rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[#94a3b8]">Estado actual</p>
              <div className="mt-2">
                <AdminBadge tone={row.statusTone}>{row.statusLabel}</AdminBadge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Cancelar
            </button>
            <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
              Guardar vinculacion
            </button>
          </div>
        </form>
      </div>
    </AppModal>
  );
}

export default function AdminDiscordRoster({ rows }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [editingRow, setEditingRow] = useState(null);
  const deferredQuery = useDeferredValue(query);

  const roleOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.expectedRole).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeText(deferredQuery);
    return rows.filter((row) => {
      if (statusFilter !== "todos" && row.statusKey !== statusFilter) return false;
      if (roleFilter !== "todos" && row.expectedRole !== roleFilter) return false;
      if (normalizedQuery && !buildSearchText(row).includes(normalizedQuery)) return false;
      return true;
    });
  }, [deferredQuery, roleFilter, rows, statusFilter]);

  return (
    <>
      <div className="space-y-4">
        <AdminSectionHeader
          eyebrow="Servidor"
          title="Miembros y roles de Discord"
          description="Vista en tiempo real del servidor, con filtros para revisar vinculaciones, roles actuales y desajustes."
          actions={
            <form action={refreshDiscordUsernamesAction}>
              <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
                Actualizar usernames
              </button>
            </form>
          }
        />

        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_1fr]">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Buscar</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, username, correo o rol"
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Estado</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
            >
              <option value="todos">Todos</option>
              <option value="sincronizado">Sincronizados</option>
              <option value="desajuste">Desajustes</option>
              <option value="sin_vincular">Sin vincular</option>
              <option value="sin_rol">Sin rol esperado</option>
              <option value="bot">Bots</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Rol esperado</span>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
            >
              <option value="todos">Todos</option>
              {roleOptions.map((roleName) => (
                <option key={roleName} value={roleName}>
                  {roleName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!filteredRows.length ? (
          <AdminEmptyState
            title="No hay miembros para ese filtro"
            description="Ajusta la busqueda o los filtros para revisar otra parte del roster."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
                <tr>
                  <th className="px-3 py-2">Miembro</th>
                  <th className="px-3 py-2">Alumno vinculado</th>
                  <th className="px-3 py-2">Rol esperado</th>
                  <th className="px-3 py-2">Roles actuales</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.discordUserId} className="border-t border-[rgba(15,23,42,0.08)] align-top">
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <p className="font-semibold text-[#111827]">{row.displayName}</p>
                        <p className="text-xs text-[#64748b]">@{row.username || "sin-username"}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.linkedStudent ? (
                        <div className="space-y-1">
                          <p className="font-semibold text-[#111827]">{row.linkedStudent.full_name || row.linkedStudent.email}</p>
                          <p className="text-xs text-[#64748b]">{row.linkedStudent.email}</p>
                          <p className="text-xs text-[#64748b]">
                            Username guardado: {row.linkedStudent.discord_username || row.username || "Sin guardar"}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[#94a3b8]">Sin alumno vinculado</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.expectedRole ? (
                        <AdminBadge tone="accent">{row.expectedRole}</AdminBadge>
                      ) : (
                        <span className="text-[#94a3b8]">Sin rol gestionado</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">{renderRoleList(row.currentRoles)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <AdminBadge tone={row.statusTone}>{row.statusLabel}</AdminBadge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!row.isBot ? (
                        <button
                          type="button"
                          onClick={() => setEditingRow(row)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] text-lg text-[#64748b] transition hover:border-[rgba(16,52,116,0.22)] hover:bg-[#f8fbff] hover:text-[#103474]"
                          aria-label={`Editar vinculacion de ${row.displayName}`}
                          title="Editar vinculacion"
                        >
                          ...
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditDiscordLinkModal row={editingRow} open={Boolean(editingRow)} onClose={() => setEditingRow(null)} />
    </>
  );
}
