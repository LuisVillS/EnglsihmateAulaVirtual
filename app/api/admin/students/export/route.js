"use server";

import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/admin/access";
import { loadAdminStudentsExportRows } from "@/lib/admin-students";
import { STUDENT_LEVELS } from "@/lib/student-constants";

function toCsvValue(value) {
  const safe = value == null ? "" : String(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

function buildFilename() {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `alumnos-${timestamp}.csv`;
}

export async function GET(request) {
  const auth = await requireAdminRouteAccess({ label: "api-admin-students-export" });
  if (auth.errorResponse) return auth.errorResponse;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const rawCourse = searchParams.get("course") || "";
  const courseFilter = STUDENT_LEVELS.includes(rawCourse) ? rawCourse : "";
  const searchTerm = (searchParams.get("q") || "").trim();
  const rawHour = searchParams.get("hour") || "";
  const parsedHour = Number(rawHour);
  const hourFilter =
    rawHour !== "" &&
    Number.isFinite(parsedHour) &&
    parsedHour >= 360 &&
    parsedHour <= 1410 &&
    parsedHour % 30 === 0
      ? parsedHour
      : null;

  const { students, error } = await loadAdminStudentsExportRows({
    supabase,
    courseFilter,
    searchTerm,
    hourFilter,
  });

  if (error) {
    return NextResponse.json({ error: "No se pudo generar la exportacion." }, { status: 500 });
  }

  const header = [
    "student_code",
    "full_name",
    "email",
    "dni",
    "phone",
    "birth_date",
    "course_level",
    "is_premium",
    "start_month",
    "enrollment_date",
    "preferred_hour",
    "estado_contrasena",
  ];

  const rows = (students || []).map((student) => [
    toCsvValue(student.student_code || ""),
    toCsvValue(student.full_name || ""),
    toCsvValue(student.email || ""),
    toCsvValue(student.dni || ""),
    toCsvValue(student.phone || ""),
    toCsvValue(student.birth_date || ""),
    toCsvValue(student.course_level || ""),
    toCsvValue(student.is_premium ? "1" : "0"),
    toCsvValue(student.start_month || ""),
    toCsvValue(student.enrollment_date || ""),
    toCsvValue(student.preferred_hour ?? ""),
    toCsvValue(student.password_set ? "Creada" : "Pendiente"),
  ]);

  const body = [header.map(toCsvValue).join(","), ...rows.map((row) => row.join(","))].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${buildFilename()}"`,
      "Cache-Control": "no-store",
    },
  });
}
