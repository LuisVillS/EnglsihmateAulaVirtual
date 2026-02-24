"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { assignStudentsToCommission } from "@/app/admin/actions";

const INITIAL_STATE = { success: false, error: null, assigned: 0 };

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
}

export default function StudentsManager({ commissionId, enrolledStudents = [], eligibleStudents = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [openNonce, setOpenNonce] = useState(0);

  const openModal = () => {
    setSearch("");
    setSelected(new Set());
    setOpen(true);
    setOpenNonce((prev) => prev + 1);
  };

  const filteredEligible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return eligibleStudents;
    return eligibleStudents.filter((student) => {
      const haystack = [student.full_name, student.email, student.course_level].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [eligibleStudents, search]);

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted">Alumnos matriculados</p>
          <p className="text-sm text-muted">{enrolledStudents.length} alumnos en esta comision</p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
        >
          Agregar alumnos
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Alumno</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Asignado</th>
            </tr>
          </thead>
          <tbody>
            {enrolledStudents.map((student) => (
              <tr key={student.id} className="border-t border-border text-foreground">
                <td className="px-3 py-3 font-semibold">{student.full_name || "Sin nombre"}</td>
                <td className="px-3 py-3">{student.email}</td>
                <td className="px-3 py-3">{formatDate(student.commission_assigned_at)}</td>
              </tr>
            ))}
            {!enrolledStudents.length ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted">
                  Aun no hay alumnos asignados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <AssignStudentsModal
          key={`${commissionId}-${openNonce}`}
          commissionId={commissionId}
          filteredEligible={filteredEligible}
          selected={selected}
          search={search}
          onSearchChange={setSearch}
          onToggleSelected={toggleSelected}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function AssignStudentsModal({
  commissionId,
  filteredEligible,
  selected,
  search,
  onSearchChange,
  onToggleSelected,
  onClose,
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(assignStudentsToCommission, INITIAL_STATE);

  useEffect(() => {
    if (!state?.success) return;
    router.refresh();
  }, [state, router]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-border bg-surface p-6 text-foreground shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Agregar alumnos</h3>
            <p className="text-xs text-muted">Solo alumnos sin comision activa.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Cerrar
          </button>
        </div>

        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar alumno..."
          className="mt-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        />

        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="commissionId" value={commissionId} />
          {Array.from(selected).map((id) => (
            <input key={id} type="hidden" name="studentIds" value={id} />
          ))}

          <div className="max-h-72 overflow-y-auto rounded-2xl border border-border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Seleccionar</th>
                  <th className="px-3 py-2">Alumno</th>
                  <th className="px-3 py-2">Email</th>
                </tr>
              </thead>
              <tbody>
                {filteredEligible.map((student) => (
                  <tr key={student.id} className="border-t border-border text-foreground">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(student.id)}
                        onChange={() => onToggleSelected(student.id)}
                      />
                    </td>
                    <td className="px-3 py-2">{student.full_name || "Sin nombre"}</td>
                    <td className="px-3 py-2">{student.email}</td>
                  </tr>
                ))}
                {!filteredEligible.length ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted">
                      No hay alumnos elegibles.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {state?.error ? (
            <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {state.error}
            </p>
          ) : null}
          {state?.success ? (
            <p className="rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
              {state.assigned || 0} alumnos asignados. Puedes cerrar el modal.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              Asignar seleccionados
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
