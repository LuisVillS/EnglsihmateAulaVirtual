"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import AdminSideDrawer from "@/components/admin-side-drawer";

const SKILL_ORDER = ["speaking", "reading", "grammar", "listening", "vocabulary"];
const SKILL_LABELS = {
  speaking: "Expresion oral",
  reading: "Lectura",
  grammar: "Gramatica",
  listening: "Escucha",
  vocabulary: "Vocabulario",
};

const MENU_WIDTH = 190;
const MENU_MARGIN = 8;

function calculateMenuPosition(rect, menuHeight = 120) {
  if (!rect) return null;

  let left = rect.right - MENU_WIDTH;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (left < 12) left = 12;
  if (left + MENU_WIDTH > viewportWidth - 12) {
    left = viewportWidth - MENU_WIDTH - 12;
  }

  let top = rect.bottom + MENU_MARGIN;
  if (top + menuHeight > viewportHeight - 12) {
    top = Math.max(12, rect.top - menuHeight - MENU_MARGIN);
  }

  return { top, left };
}

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
    return "bg-success/10 text-success border-success/20";
  }
  return "bg-surface-2 text-muted border-border";
}

function buildSkillEntries(skills = {}) {
  return SKILL_ORDER.map((key) => {
    const score = clampScore(skills?.[key]);
    return {
      key,
      label: SKILL_LABELS[key],
      score: score ?? 0,
    };
  }).sort((a, b) => b.score - a.score);
}

function buildSkillSummary(skills = {}) {
  const entries = buildSkillEntries(skills);
  const positives = entries.filter((entry) => entry.score > 0);
  if (!positives.length) {
    return {
      hasData: false,
      topEntries: [],
      remainingCount: entries.length,
      entries,
    };
  }

  const topEntries = positives.slice(0, 2);
  const remainingCount = Math.max(0, entries.length - topEntries.length);
  return {
    hasData: true,
    topEntries,
    remainingCount,
    entries,
  };
}

function SkillDetailsList({ student }) {
  const summary = buildSkillSummary(student?.skills || {});
  return (
    <div className="w-[320px] p-4">
      <div className="space-y-3">
        {summary.entries.map((entry) => (
          <div key={`${student?.id || "student"}-${entry.key}`}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{entry.label}</span>
              <span className={entry.score > 0 ? "font-medium text-foreground" : "text-muted"}>
                {formatScore(entry.score)}
              </span>
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-surface-2">
              <div
                className={entry.score > 0 ? "h-full rounded-full bg-primary/80" : "h-full rounded-full bg-primary/20"}
                style={{ width: `${entry.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RowActionsMenu({ studentId, onEdit }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const anchorRectRef = useRef(null);

  const closeMenu = () => {
    setOpen(false);
    setMenuStyle(null);
  };

  const toggleMenu = () => {
    if (open) {
      closeMenu();
      return;
    }
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    anchorRectRef.current = rect;
    setMenuStyle(calculateMenuPosition(rect));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !buttonRef.current?.contains(event.target)
      ) {
        closeMenu();
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") closeMenu();
    }
    function handleViewportChange() {
      closeMenu();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !anchorRectRef.current) return;
    const measuredHeight = menuRef.current.offsetHeight || 120;
    const nextStyle = calculateMenuPosition(anchorRectRef.current, measuredHeight);
    if (nextStyle && (nextStyle.top !== menuStyle?.top || nextStyle.left !== menuStyle?.left)) {
      setMenuStyle(nextStyle);
    }
  }, [open, menuStyle]);

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              width: MENU_WIDTH,
              zIndex: 10000,
            }}
            className="rounded-2xl border border-border bg-surface p-2 text-sm text-foreground shadow-2xl shadow-black/35"
          >
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onEdit();
              }}
              className="block w-full rounded-xl px-3 py-2 text-left text-foreground transition hover:bg-surface-2"
            >
              Editar nota
            </button>
            <Link
              href={`/admin/teacher-dashboard/${studentId}`}
              prefetch={false}
              onClick={closeMenu}
              className="mt-1 block rounded-xl px-3 py-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
            >
              Ver perfil
            </Link>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        onClick={toggleMenu}
        ref={buttonRef}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition hover:border-primary hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Acciones"
      >
        <span className="text-lg leading-none">&#8942;</span>
      </button>
      {menu}
    </div>
  );
}

function SkillsPanel({ student, onClose }) {
  return (
    <AdminSideDrawer
      open={Boolean(student)}
      onClose={onClose}
      title={student?.full_name || "Alumno"}
      description={student?.student_code || "Detalle de habilidades"}
      widthClass="max-w-[420px]"
    >
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Desempeno por habilidad</p>
        <SkillDetailsList student={student} />
      </div>
    </AdminSideDrawer>
  );
}

function GradePanel({ student, onClose, onSaved }) {
  const router = useRouter();
  const [grade, setGrade] = useState(
    clampScore(student?.admin_grade) != null
      ? String(Math.round(clampScore(student.admin_grade)))
      : clampScore(student?.course_average) != null
        ? String(Math.round(clampScore(student.course_average)))
        : ""
  );
  const [speaking, setSpeaking] = useState(
    clampScore(student?.speaking_manual) != null
      ? String(Math.round(clampScore(student.speaking_manual)))
      : clampScore(student?.speaking_current) != null
        ? String(Math.round(clampScore(student.speaking_current)))
        : ""
  );
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const [gradeResponse, speakingResponse] = await Promise.all([
        fetch(`/api/admin/students/${student.id}/grade`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level: student.current_level,
            admin_grade: grade,
            comment,
          }),
        }),
        fetch(`/api/admin/students/${student.id}/speaking`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level: student.current_level,
            speaking_value: speaking,
          }),
        }),
      ]);

      const gradeData = await gradeResponse.json().catch(() => ({}));
      if (!gradeResponse.ok) {
        throw new Error(gradeData?.error || "No se pudo guardar nota admin.");
      }
      const speakingData = await speakingResponse.json().catch(() => ({}));
      if (!speakingResponse.ok) {
        throw new Error(speakingData?.error || "No se pudo guardar speaking.");
      }

      onSaved?.();
      router.refresh();
      onClose?.();
    } catch (err) {
      setError(err?.message || "No se pudieron guardar las notas.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminSideDrawer
      open={Boolean(student)}
      onClose={onClose}
      title={student?.full_name || "Alumno"}
      description={student?.student_code || "Ajuste manual de notas"}
      widthClass="max-w-[460px]"
    >
      <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">Editar notas</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{student.full_name}</h3>
            <p className="text-xs text-muted">{student.student_code || "Sin codigo"}</p>
          </div>
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
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Speaking (manual) (0-100)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={speaking}
              onChange={(event) => setSpeaking(event.target.value)}
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
            {pending ? "Guardando..." : "Guardar"}
          </button>
        </form>
    </AdminSideDrawer>
  );
}

export default function TeacherDashboardStudentsTable({ students = [] }) {
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [skillsDetailStudentId, setSkillsDetailStudentId] = useState(null);

  const editingStudent = useMemo(
    () => students.find((student) => student.id === editingStudentId) || null,
    [students, editingStudentId]
  );
  const skillsDetailStudent = useMemo(
    () => students.find((student) => student.id === skillsDetailStudentId) || null,
    [students, skillsDetailStudentId]
  );

  return (
    <div className="rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_16px_32px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Seguimiento</p>
          <h3 className="text-xl font-semibold text-foreground">Resumen por estudiante</h3>
        </div>
        <p className="text-sm text-muted">{students.length} registro(s)</p>
      </div>

      <div className="relative overflow-visible">
        <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full min-w-[900px] border-separate border-spacing-y-1.5 text-sm md:min-w-[1080px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="min-w-[220px] px-3 py-2">Alumno</th>
              <th className="min-w-[170px] px-3 py-2">Comision</th>
              <th className="w-[90px] px-3 py-2">Nivel</th>
              <th className="w-[110px] px-3 py-2">Estado</th>
              <th className="w-[130px] px-3 py-2">Promedio</th>
              <th className="w-[320px] max-w-[420px] px-3 py-2">Habilidades</th>
              <th className="w-[90px] px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const skillSummary = buildSkillSummary(student.skills || {});
              const inlineSummary = skillSummary.topEntries
                .map((entry) => `${entry.label} ${Math.round(entry.score)}%`)
                .join(" · ");

              return (
                <tr key={student.id} className="align-middle transition-colors hover:bg-[#f8fbff]">
                  <td className="min-w-[220px] rounded-l-2xl bg-[#f8fafc] px-3 py-3 align-middle">
                    <p className="font-semibold text-foreground">{student.full_name}</p>
                    <p className="text-xs text-muted">{student.student_code || "Sin codigo"}</p>
                  </td>
                  <td className="min-w-[170px] bg-[#f8fafc] px-3 py-3 align-middle text-muted">
                    {student.commission_label || "Sin comision"}
                  </td>
                  <td className="w-[90px] bg-[#f8fafc] px-3 py-3 align-middle text-foreground">{student.current_level || "--"}</td>
                  <td className="w-[110px] bg-[#f8fafc] px-3 py-3 align-middle">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(student.status)}`}>
                      {student.status === "active" ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="w-[130px] bg-[#f8fafc] px-3 py-3 align-middle">
                    <div className="min-w-[84px]">
                      <p className="text-base font-semibold text-foreground">{formatScore(student.course_average)}</p>
                      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-primary/80"
                          style={{ width: `${clampScore(student.course_average) ?? 0}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="w-[320px] max-w-[420px] bg-[#f8fafc] px-3 py-3 align-middle">
                    <div className="flex min-w-0 items-center gap-2">
                      {skillSummary.hasData ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setSkillsDetailStudentId(student.id)}
                            className="min-w-0 truncate text-left text-sm text-muted hover:text-foreground"
                          >
                            {inlineSummary}
                          </button>
                          {skillSummary.remainingCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setSkillsDetailStudentId(student.id)}
                              className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-surface"
                            >
                              +{skillSummary.remainingCount}
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 truncate text-sm text-muted">Sin datos</span>
                          <button
                            type="button"
                            onClick={() => setSkillsDetailStudentId(student.id)}
                            className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-surface"
                          >
                            Ver
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="w-[90px] rounded-r-2xl bg-[#f8fafc] px-3 py-3 align-middle text-right">
                    <RowActionsMenu studentId={student.id} onEdit={() => setEditingStudentId(student.id)} />
                  </td>
                </tr>
              );
            })}
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
      </div>

      {skillsDetailStudent ? (
        <SkillsPanel student={skillsDetailStudent} onClose={() => setSkillsDetailStudentId(null)} />
      ) : null}

      {editingStudent ? (
        <GradePanel student={editingStudent} onClose={() => setEditingStudentId(null)} onSaved={() => {}} />
      ) : null}
    </div>
  );
}

