"use client";

import { useMemo, useState } from "react";
import { AdminCard, AdminPageHeader, AdminStatCard, AdminStatsGrid, AdminToolbar } from "@/components/admin-page";
import AppModal from "@/components/app-modal";
import CommissionCreateForm from "./commission-create-form";
import CommissionsTable from "./table";

export default function CommissionsWorkspace({ commissions = [], templates = [] }) {
  const [createOpen, setCreateOpen] = useState(false);

  const metrics = useMemo(() => {
    const active = commissions.filter((commission) => commission.computed_status === "active").length;
    const upcoming = commissions.filter((commission) => commission.computed_status === "upcoming").length;
    const inactive = commissions.filter((commission) => commission.computed_status === "inactive").length;
    const students = commissions.reduce((sum, commission) => sum + Number(commission.enrolled_count || 0), 0);
    return { active, upcoming, inactive, students };
  }, [commissions]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Operaciones academicas"
        title="Comisiones"
        description="Gestiona grupos, horarios y altas nuevas con la misma logica actual, pero dentro de una vista mas clara y operativa."
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
          >
            Nueva comision
          </button>
        }
      />

      <AdminStatsGrid>
        <AdminStatCard label="Activas" value={metrics.active} hint="Comisiones en curso" />
        <AdminStatCard label="Proximas" value={metrics.upcoming} hint="Programadas para iniciar" />
        <AdminStatCard label="Inactivas" value={metrics.inactive} hint="Pausadas o cerradas" />
        <AdminStatCard label="Matriculas" value={metrics.students} hint="Alumnos asignados" />
      </AdminStatsGrid>

      <AdminToolbar>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Vista operativa</p>
            <p className="mt-1 text-sm text-[#475569]">
              Filtra, revisa estados y usa acciones por fila sin salir de la ruta actual.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-[rgba(16,52,116,0.16)] bg-[#eef3ff] px-2.5 py-1 text-[11px] font-semibold text-[#103474]">
              {commissions.length} comision(es)
            </span>
            <span className="inline-flex rounded-full border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
              Creacion por modal
            </span>
          </div>
        </div>
      </AdminToolbar>

      <CommissionsTable commissions={commissions} />

      <AppModal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva comision" widthClass="max-w-4xl">
        <AdminCard className="border-0 bg-transparent p-0 shadow-none">
          <div className="space-y-2 pb-4">
            <p className="text-sm font-semibold text-[#111827]">Alta rapida</p>
            <p className="text-sm text-[#64748b]">
              El formulario mantiene exactamente la misma logica y calculos; solo cambia la presentacion.
            </p>
          </div>
          <CommissionCreateForm templates={templates} />
        </AdminCard>
      </AppModal>
    </>
  );
}
