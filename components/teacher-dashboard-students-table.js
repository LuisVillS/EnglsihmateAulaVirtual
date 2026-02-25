"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SKILL_ORDER = ["speaking", "reading", "grammar", "listening"];
const SKILL_LABELS = {
  speaking: "Speaking",
  reading: "Reading",
  grammar: "Grammar",
  listening: "Listening",
};

function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

function formatScore(value) {
  const score = clampScore(value);
  if (score == null) return "--";
  return `${Math.round(score)}%`;
}

function statusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") {
    return "bg-success/15 text-success border-success/30";
  }
  return "bg-surface-2 text-muted border-border";
}

function SkillChip({ label, value }) {
  const width = clampScore(value) ?? 0;
  return (
    <div className="min-w-[130px]">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-foreground">{formatScore(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function GradePanel({ student, onClose, onSaved }) {
  const router = useRouter();
  const [grade, setGrade] = useState(
    clampScore(student?.course_average) != null ? String(Math.round(clampScore(student.course_average))) : ""
  );
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/students/${student.id}/grade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: student.current_level,
          admin_grade: grade,
          comment,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo guardar nota.");
      }

      onSaved?.();
      router.refresh();
      onClose?.();
    } catch (err) {
      setError(err?.message || "No se pudo guardar nota.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
      <button type="button" className="flex-1 cursor-default" onClick={onClose} aria-label="Cerrar panel" />
      <aside className="w-full max-w-md border-l border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">Editar nota</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{student.full_name}</h3>
            <p className="text-xs text-muted">{student.student_code || "Sin código"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:border-primary"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nivel</label>
            <input
              value={student.current_level || ""}
              disabled
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nota admin (0-100)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              required
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Comentario (opcional)</label>
            <textarea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-70"
          >
            {pending ? "Guardando..." : "Guardar nota"}
          </button>
        </form>
      </aside>
    </div>
  );
}

export default function TeacherDashboardStudentsTable({ students = [] }) {
  const [editingStudentId, setEditingStudentId] = useState(null);
  const editingStudent = useMemo(
    () => students.find((student) => student.id === editingStudentId) || null,
    [students, editingStudentId]
  );

  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Alumnos</p>
          <h3 className="text-xl font-semibold text-foreground">Resumen por estudiante</h3>
        </div>
        <p className="text-sm text-muted">{students.length} registro(s)</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Alumno</th>
              <th className="px-3 py-2">Comisión</th>
              <th className="px-3 py-2">Nivel</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Promedio</th>
              <th className="px-3 py-2">Habilidades</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-t border-border/70 align-top">
                <td className="px-3 py-3">
                  <p className="font-semibold text-foreground">{student.full_name}</p>
                  <p className="text-xs text-muted">{student.student_code || "Sin código"}</p>
                </td>
                <td className="px-3 py-3 text-foreground">{student.commission_label || "Sin comisión"}</td>
                <td className="px-3 py-3 text-foreground">{student.current_level || "--"}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge(student.status)}`}
                  >
                    {student.status === "active" ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-3 font-semibold text-foreground">{formatScore(student.course_average)}</td>
                <td className="px-3 py-3">
                  <div className="grid grid-cols-2 gap-2">
                    {SKILL_ORDER.map((skillKey) => (
                      <SkillChip
                        key={`${student.id}-${skillKey}`}
                        label={SKILL_LABELS[skillKey]}
                        value={student.skills?.[skillKey]}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/teacher-dashboard/${student.id}`}
                      className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary"
                    >
                      Ver perfil
                    </Link>
                    <button
                      type="button"
                      onClick={() => setEditingStudentId(student.id)}
                      className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-2"
                    >
                      Editar nota
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!students.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted">
                  No hay alumnos para estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editingStudent ? (
        <GradePanel student={editingStudent} onClose={() => setEditingStudentId(null)} onSaved={() => {}} />
      ) : null}
    </div>
  );
}
