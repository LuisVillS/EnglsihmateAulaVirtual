import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { ensureReservationStatus, getPreEnrollment } from "@/lib/pre-enrollment";
import { autoDeactivateExpiredCommissions, getLimaTodayISO } from "@/lib/commissions";
import { formatEnrollmentFrequencyLabel } from "@/lib/frequency-labels";

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function getStartMonthLimits(baseDate = new Date()) {
  const currentMonthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const minDate = new Date(currentMonthStart);
  if (baseDate.getDate() >= 8) {
    minDate.setMonth(minDate.getMonth() + 1);
  }

  const maxDate = new Date(currentMonthStart);
  maxDate.setMonth(maxDate.getMonth() + 6);
  return { minDate, maxDate };
}

function dateToMonthKey(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonthKey(value) {
  if (!value) return null;
  const match = value.toString().trim().match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function monthKeyInRange(monthKey, minDate, maxDate) {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return false;
  const [year, month] = normalized.split("-").map(Number);
  const compare = year * 100 + month;
  const minCompare = minDate.getFullYear() * 100 + (minDate.getMonth() + 1);
  const maxCompare = maxDate.getFullYear() * 100 + (maxDate.getMonth() + 1);
  return compare >= minCompare && compare <= maxCompare;
}

function formatMonthLabel(monthKey) {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return monthKey;
  const [yearRaw, monthRaw] = normalized.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const label = MONTH_LABELS[month - 1] || monthRaw;
  return `${label} ${year}`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startMonth = normalizeMonthKey(searchParams.get("startMonth"));
    const level = searchParams.get("level");
    const frequency = searchParams.get("frequency");
    const courseId = searchParams.get("courseId");

    if (!startMonth && !level && !frequency && !courseId) {
      await autoDeactivateExpiredCommissions();
    }

    const userId = await resolvePreEnrollmentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const service = getServiceSupabaseClient();
    let { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id, email_verified_at, status")
      .eq("id", userId)
      .maybeSingle();
    if (profileError && String(profileError.message || "").toLowerCase().includes("status")) {
      const fallback = await service
        .from("profiles")
        .select("id, email_verified_at")
        .eq("id", userId)
        .maybeSingle();
      profile = fallback.data;
      profileError = fallback.error;
    }
    if (profileError) {
      throw new Error(profileError.message || "No se pudo validar el perfil.");
    }
    if (!profile?.email_verified_at && profile?.status !== "pre_registered") {
      return NextResponse.json({ error: "Correo no verificado." }, { status: 403 });
    }

    const preEnrollment = await ensureReservationStatus(await getPreEnrollment(userId));

    const todayIso = getLimaTodayISO();
    const { data: activeCommissions } = await service
      .from("course_commissions")
      .select("id, course_level, modality_key, start_time, end_time, start_date, end_date, is_active")
      .eq("is_active", true)
      .gte("end_date", todayIso);

    const { minDate, maxDate } = getStartMonthLimits();
    const availableMonthSet = new Set(
      (activeCommissions || [])
        .map((row) => dateToMonthKey(row.start_date))
        .filter((monthKey) => monthKey && monthKeyInRange(monthKey, minDate, maxDate))
    );
    const startMonths = Array.from(availableMonthSet)
      .sort((a, b) => a.localeCompare(b))
      .map((monthKey) => ({
        value: monthKey,
        label: formatMonthLabel(monthKey),
      }));

    const preEnrollmentMonth = normalizeMonthKey(preEnrollment?.start_month || "");
    const effectiveStartMonth = startMonth && availableMonthSet.has(startMonth)
      ? startMonth
      : preEnrollmentMonth && availableMonthSet.has(preEnrollmentMonth)
        ? preEnrollmentMonth
        : null;

    const commissionsByMonth = effectiveStartMonth
      ? (activeCommissions || []).filter((row) => dateToMonthKey(row.start_date) === effectiveStartMonth)
      : [];
    const levelsForMonth = Array.from(new Set(commissionsByMonth.map((row) => row.course_level).filter(Boolean)));

    if (!effectiveStartMonth) {
      return NextResponse.json({
        preEnrollment,
        startMonths,
        levels: [],
        frequencies: [],
        courses: [],
        schedules: [],
      });
    }

    if (!level) {
      return NextResponse.json({
        preEnrollment,
        startMonths,
        levels: levelsForMonth,
        frequencies: [],
        courses: [],
        schedules: [],
      });
    }

    const frequenciesForLevel = Array.from(
      new Set(
        commissionsByMonth
          .filter((row) => row.course_level === level)
          .map((row) => row.modality_key)
          .filter(Boolean)
      )
    ).map((key) => ({
      value: key,
      label: formatEnrollmentFrequencyLabel(key),
    }));

    if (level && !frequency) {
      return NextResponse.json({
        preEnrollment,
        startMonths,
        levels: levelsForMonth,
        frequencies: frequenciesForLevel,
        courses: [],
        schedules: [],
      });
    }

    const { data: courses } = await service
      .from("courses")
      .select("id, title, level")
      .eq("level", level)
      .order("title", { ascending: true });

    const resolvedCourses =
      (courses || []).length > 0
        ? (courses || []).map((course) => ({ id: course.id, label: course.title }))
        : [{ id: `generic-${level}`, label: `Programa ${level}` }];

    if (!courseId) {
      return NextResponse.json({
        preEnrollment,
        startMonths,
        levels: levelsForMonth,
        frequencies: frequenciesForLevel,
        courses: resolvedCourses,
        schedules: [],
      });
    }

    const schedules = Array.from(
      new Map(
        commissionsByMonth
          .filter((row) => row.course_level === level && row.modality_key === frequency)
          .map((row) => [
            `${row.start_time}-${row.end_time}`,
            {
              id: `${row.start_time}-${row.end_time}`,
              start_time: row.start_time,
              end_time: row.end_time,
              label: `${row.start_time} - ${row.end_time}`,
            },
          ])
      ).values()
    );

    return NextResponse.json({
      preEnrollment,
      startMonths,
      levels: levelsForMonth,
      frequencies: frequenciesForLevel,
      courses: resolvedCourses,
      schedules,
    });
  } catch (error) {
    console.error("[Matricula] options error", error);
    return NextResponse.json({ error: error.message || "No se pudieron cargar opciones." }, { status: 400 });
  }
}
