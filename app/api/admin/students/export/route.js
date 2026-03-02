"use server";

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { STUDENT_LEVELS } from "@/lib/student-constants";

function sanitizeSearch(value) {
  return value.replace(/%/g, "\\%").replace(/,/g, "\\,");
}

function toCsvValue(value) {
  const safe = value == null ? "" : String(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

function buildFilename() {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `alumnos-${timestamp}.csv`;
}

export async function GET(request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminRecord } = await supabase.from("admin_profiles").select("id").eq("id", user.id).maybeSingle();
  if (!adminRecord?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const studentsBaseSelect =
    "student_code, full_name, email, dni, phone, birth_date, course_level, is_premium, start_month, enrollment_date, password_set, preferred_hour";
  let studentsQuery = supabase
    .from("profiles")
    .select(studentsBaseSelect)
    .eq("role", "student")
    .or("status.eq.enrolled,status.is.null");

  if (courseFilter) {
    studentsQuery = studentsQuery.eq("course_level", courseFilter);
  }

  if (hourFilter != null) {
    studentsQuery = studentsQuery.eq("preferred_hour", hourFilter);
  }

  if (searchTerm) {
    const sanitized = sanitizeSearch(searchTerm);
    studentsQuery = studentsQuery.or(
      `full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,dni.ilike.%${sanitized}%,student_code.ilike.%${sanitized}%`
    );
  }

  let { data, error } = await studentsQuery.order("created_at", { ascending: false });
  if (error && String(error.message || "").toLowerCase().includes("status")) {
    let legacyQuery = supabase.from("profiles").select(studentsBaseSelect).eq("role", "student");
    if (courseFilter) legacyQuery = legacyQuery.eq("course_level", courseFilter);
    if (hourFilter != null) legacyQuery = legacyQuery.eq("preferred_hour", hourFilter);
    if (searchTerm) {
      const sanitized = sanitizeSearch(searchTerm);
      legacyQuery = legacyQuery.or(
        `full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,dni.ilike.%${sanitized}%,student_code.ilike.%${sanitized}%`
      );
    }
    const legacyResult = await legacyQuery.order("created_at", { ascending: false });
    data = legacyResult.data;
    error = legacyResult.error;
  }

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

  const rows = (data || []).map((student) => [
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
