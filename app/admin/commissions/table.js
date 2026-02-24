"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setCommissionActive } from "@/app/admin/actions";

const STATUS_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Activas" },
  { value: "inactive", label: "Desactivadas" },
];

const FREQUENCY_LABELS = {
  DAILY: "Diaria",
  MWF: "LMV",
  LMV: "LMV",
  TT: "MJ",
  SAT: "Sabatino",
};

const MENU_WIDTH = 176;
const MENU_MARGIN = 8;

function calculateMenuPosition(rect, menuHeight = 140) {
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

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
}

function formatFrequency(value) {
  return FREQUENCY_LABELS[value] || value || "-";
}

function formatStatusLabel(status) {
  return status === "active" ? "Activa" : "Desactivada";
}

function CommissionMenu({ commission, onDelete }) {
  const isActive = commission.computed_status === "active";
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
    const rect = anchorRectRef.current;
    const measuredHeight = menuRef.current.offsetHeight || 140;
    const nextStyle = calculateMenuPosition(rect, measuredHeight);
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
            className="rounded-2xl border border-border bg-surface p-2 text-right text-sm text-foreground shadow-2xl shadow-black/35"
          >
            <Link
              href={`/admin/commissions/${commission.id}`}
              prefetch={false}
              onClick={closeMenu}
              className="block rounded-lg px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-2"
            >
              Editar
            </Link>
            <form action={setCommissionActive}>
              <input type="hidden" name="commissionId" value={commission.id} />
              <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
              <button
                type="submit"
                onClick={closeMenu}
                className="block w-full rounded-lg px-3 py-2 text-right text-xs font-semibold text-foreground transition hover:bg-surface-2"
              >
                {isActive ? "Desactivar" : "Activar"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onDelete(commission);
              }}
              className="block w-full rounded-lg px-3 py-2 text-right text-xs font-semibold text-danger transition hover:bg-danger/10"
            >
              Borrar
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        ref={buttonRef}
        onClick={toggleMenu}
        className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Acciones de la comision"
      >
        ...
      </button>
      {menu}
    </div>
  );
}

function DeleteModal({ open, data, onCancel, onConfirm, busy }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 text-foreground shadow-2xl">
        <h3 className="text-xl font-semibold">Eliminar comision</h3>
        <p className="mt-2 text-sm text-muted">
          Hay {data?.enrolledCount || 0} alumnos matriculados en esta comision. Si la borras, perderan el curso activo.
        </p>
        {data?.error ? (
          <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {data.error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full border border-danger/60 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed"
          >
            Borrar igual
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommissionsTable({ commissions = [] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [frequencyFilter, setFrequencyFilter] = useState("all");
  const [deleteState, setDeleteState] = useState({ open: false, commission: null, enrolledCount: 0, error: null });
  const [isPending, startTransition] = useTransition();

  const levels = useMemo(() => {
    const set = new Set(commissions.map((item) => item.course_level).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [commissions]);

  const frequencies = useMemo(() => {
    const set = new Set(commissions.map((item) => item.modality_key).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [commissions]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return commissions.filter((commission) => {
      if (statusFilter === "active" && commission.computed_status !== "active") return false;
      if (statusFilter === "inactive" && commission.computed_status === "active") return false;
      if (levelFilter !== "all" && commission.course_level !== levelFilter) return false;
      if (frequencyFilter !== "all" && commission.modality_key !== frequencyFilter) return false;
      if (!term) return true;

      const haystack = [
        commission.commission_number,
        commission.course_level,
        commission.start_time,
        commission.end_time,
        formatFrequency(commission.modality_key),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [commissions, search, statusFilter, levelFilter, frequencyFilter]);

  const handleDelete = async (commission) => {
    if (!commission?.id) return;
    setDeleteState({ open: false, commission: null, enrolledCount: 0, error: null });
    const response = await fetch(`/api/admin/commissions/${commission.id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      setDeleteState({
        open: true,
        commission,
        enrolledCount: data?.enrolledCount || 0,
        error: data?.error || "No se pudo eliminar la comision.",
      });
      return;
    }

    if (data?.canDelete === false) {
      setDeleteState({ open: true, commission, enrolledCount: data.enrolledCount || 0, error: null });
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  };

  const handleForceDelete = async () => {
    const commission = deleteState.commission;
    if (!commission?.id) return;
    const response = await fetch(`/api/admin/commissions/${commission.id}?force=true`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setDeleteState((prev) => ({
        ...prev,
        error: data?.error || "No se pudo eliminar la comision.",
      }));
      return;
    }
    setDeleteState({ open: false, commission: null, enrolledCount: 0, error: null });
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[560px] flex-col rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por comision, curso u horario"
          className="w-full max-w-sm rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={levelFilter}
          onChange={(event) => setLevelFilter(event.target.value)}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        >
          {levels.map((level) => (
            <option key={level} value={level}>
              {level === "all" ? "Todos los niveles" : level}
            </option>
          ))}
        </select>
        <select
          value={frequencyFilter}
          onChange={(event) => setFrequencyFilter(event.target.value)}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
        >
          {frequencies.map((freq) => (
            <option key={freq} value={freq}>
              {freq === "all" ? "Todas las frecuencias" : formatFrequency(freq)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted">
          {filtered.length} de {commissions.length} comisiones
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="overflow-x-auto overflow-y-visible pr-1">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Comision #</th>
              <th className="px-3 py-2">Curso</th>
              <th className="px-3 py-2">Frecuencia</th>
              <th className="px-3 py-2">Horario</th>
              <th className="px-3 py-2">Inicio</th>
              <th className="px-3 py-2">Fin</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Alumnos</th>
              <th className="px-3 py-2 text-right">Menu</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((commission) => (
              <tr key={commission.id} className="border-t border-border text-foreground">
                <td className="px-3 py-3 font-semibold">#{commission.commission_number}</td>
                <td className="px-3 py-3">{commission.course_level}</td>
                <td className="px-3 py-3">{formatFrequency(commission.modality_key)}</td>
                <td className="px-3 py-3">
                  {commission.start_time || "-"} - {commission.end_time || "-"}
                </td>
                <td className="px-3 py-3">{formatDate(commission.start_date)}</td>
                <td className="px-3 py-3">{formatDate(commission.end_date)}</td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      commission.computed_status === "active"
                        ? "bg-success/20 text-success"
                        : "bg-white/10 text-white/70"
                    }`}
                  >
                    {formatStatusLabel(commission.computed_status)}
                  </span>
                </td>
                <td className="px-3 py-3">{commission.enrolled_count || 0}</td>
                <td className="px-3 py-3 text-right">
                  <CommissionMenu commission={commission} onDelete={handleDelete} />
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted">
                  No hay comisiones para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>

      <DeleteModal
        open={deleteState.open}
        data={deleteState}
        onCancel={() => setDeleteState({ open: false, commission: null, enrolledCount: 0, error: null })}
        onConfirm={handleForceDelete}
        busy={isPending}
      />
    </div>
  );
}
