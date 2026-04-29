"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminBadge, AdminCard, AdminSectionHeader } from "@/components/admin-page";
import AdminSideDrawer from "@/components/admin-side-drawer";
import StudentRowActions from "@/components/student-row-actions";
import { formatUnifiedCourseType } from "@/lib/course-config";

function formatHourLabel(hour) {
  if (hour == null) return "Sin horario";
  const hours = Math.floor(hour / 60);
  const minutes = hour % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes === 0 ? "00" : "30"}`;
}

function formatDate(value) {
  if (!value) return "No registrado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMonth(value) {
  if (!value) return "No definido";
  const parsed = new Date(String(value).length <= 7 ? `${value}-01` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
  });
}

function formatCommissionLabel(commission, fallbackLevel = "") {
  if (!commission) return fallbackLevel || "Sin comision";
  return `${commission.course_level} - Comision ${commission.commission_number}`;
}

function resolveStudentStatusLabel(value) {
  const map = {
    active: "Activo",
    enrolled: "Matriculado",
    invited: "Invitado",
    inactive: "Inactivo",
    suspended: "Suspendido",
  };
  return map[String(value || "").toLowerCase()] || "Sin estado";
}

function resolveStudentStatusTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "active" || normalized === "enrolled") return "success";
  if (normalized === "invited") return "accent";
  if (normalized === "inactive" || normalized === "suspended") return "warning";
  return "neutral";
}

function VerificationBadge({ verified }) {
  return verified ? <AdminBadge tone="success">Verificado</AdminBadge> : <AdminBadge tone="warning">Pendiente</AdminBadge>;
}

function StudentTypeBadge() {
  return <AdminBadge tone="accent">{formatUnifiedCourseType()}</AdminBadge>;
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[rgba(15,23,42,0.06)] py-2 last:border-b-0">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">{label}</span>
      <span className="text-sm text-[#111827]">{value || "-"}</span>
    </div>
  );
}

export default function AdminStudentsRoster({ students, totalCount, page, totalPages }) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === String(selectedStudentId)) || null,
    [selectedStudentId, students]
  );

  return (
    <>
      <AdminCard className="overflow-hidden p-0">
        <div className="border-b border-[rgba(15,23,42,0.08)] px-5 py-4">
          <AdminSectionHeader
            eyebrow="Lista principal"
            title="Alumnos"
            description="La tabla mantiene los mismos datos y acciones, pero ahora facilita el escaneo y la revision rapida."
            meta={
              <p className="text-xs text-[#64748b]">
                Pagina {page} de {totalPages} - {students.length} visibles / {totalCount} total
              </p>
            }
          />
        </div>

        <div className="relative overflow-visible">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-sm text-[#0f172a]">
              <thead>
                <tr className="bg-[#f8fafc] text-left text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
                  <th className="px-4 py-3 font-semibold">Alumno</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Curso</th>
                  <th className="px-4 py-3 font-semibold">Horario</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-t border-[rgba(15,23,42,0.08)] align-top">
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedStudentId(student.id)}
                          className="text-left transition hover:text-[#103474]"
                        >
                          <span className="block font-semibold text-[#111827]">{student.full_name || student.email}</span>
                          <span className="block text-xs text-[#64748b]">
                            Codigo: {student.student_code || "Sin codigo"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStudentId(student.id)}
                          className="inline-flex min-h-8 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#103474] transition hover:border-[rgba(16,52,116,0.22)] hover:bg-[#f8fbff]"
                        >
                          Ver ficha
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-sm text-[#475569]">
                        <p>{student.email || "-"}</p>
                        <p>{student.phone || "Sin celular"}</p>
                        <p className="text-xs text-[#94a3b8]">DNI: {student.dni || "No registrado"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <VerificationBadge verified={Boolean(student.email_verified_at)} />
                        <StudentTypeBadge />
                        <AdminBadge tone={resolveStudentStatusTone(student.status)}>
                          {resolveStudentStatusLabel(student.status)}
                        </AdminBadge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-medium text-[#111827]">
                          {formatCommissionLabel(student.commission, student.course_level)}
                        </p>
                        <p className="text-xs text-[#64748b]">Inicio: {formatMonth(student.start_month)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-sm text-[#475569]">
                        <p>{formatHourLabel(student.preferred_hour)}</p>
                        <p className="text-xs text-[#94a3b8]">
                          Matricula: {formatDate(student.enrollment_date)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StudentRowActions studentId={student.id} />
                    </td>
                  </tr>
                ))}
                {!students.length ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[#64748b]">
                      No se encontraron alumnos con los filtros actuales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </AdminCard>

      <AdminSideDrawer
        open={Boolean(selectedStudent)}
        onClose={() => setSelectedStudentId("")}
        title={selectedStudent?.full_name || selectedStudent?.email || "Ficha del alumno"}
        description="Vista rapida del alumno sin salir de la tabla."
      >
        {selectedStudent ? (
          <div className="space-y-5">
            <div className="rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#103474] text-base font-semibold text-white">
                  {String(selectedStudent.full_name || selectedStudent.email || "A").trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-semibold text-[#111827]">
                    {selectedStudent.full_name || selectedStudent.email}
                  </p>
                  <p className="text-xs text-[#64748b]">
                    Codigo: {selectedStudent.student_code || "Sin codigo"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <VerificationBadge verified={Boolean(selectedStudent.email_verified_at)} />
                    <StudentTypeBadge />
                    <AdminBadge tone={resolveStudentStatusTone(selectedStudent.status)}>
                      {resolveStudentStatusLabel(selectedStudent.status)}
                    </AdminBadge>
                  </div>
                </div>
              </div>
            </div>

            <section className="rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Contacto</p>
              <div className="mt-3">
                <InfoRow label="Email" value={selectedStudent.email || "No registrado"} />
                <InfoRow label="Celular" value={selectedStudent.phone || "No registrado"} />
                <InfoRow label="DNI" value={selectedStudent.dni || "No registrado"} />
                <InfoRow label="Nacimiento" value={formatDate(selectedStudent.birth_date)} />
              </div>
            </section>

            <section className="rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Academico</p>
              <div className="mt-3">
                <InfoRow label="Curso" value={selectedStudent.course_level || "No registrado"} />
                <InfoRow
                  label="Comision"
                  value={formatCommissionLabel(selectedStudent.commission, selectedStudent.course_level)}
                />
                <InfoRow label="Horario" value={formatHourLabel(selectedStudent.preferred_hour)} />
                <InfoRow label="Mes de inicio" value={formatMonth(selectedStudent.start_month)} />
                <InfoRow label="Fecha de matricula" value={formatDate(selectedStudent.enrollment_date)} />
              </div>
            </section>

            <section className="rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Acceso</p>
              <div className="mt-3">
                <InfoRow
                  label="Correo verificado"
                  value={selectedStudent.email_verified_at ? formatDate(selectedStudent.email_verified_at) : "Pendiente"}
                />
                <InfoRow
                  label="Contrasena"
                  value={selectedStudent.password_set ? "Configurada" : "Pendiente"}
                />
                <InfoRow label="Creado" value={formatDate(selectedStudent.created_at)} />
              </div>
            </section>

            <Link
              href={`/admin/students/${selectedStudent.id}`}
              onClick={() => setSelectedStudentId("")}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Abrir ficha completa
            </Link>
          </div>
        ) : null}
      </AdminSideDrawer>
    </>
  );
}
