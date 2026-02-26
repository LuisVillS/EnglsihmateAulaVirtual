import { sendBrevoTemplateEmail } from "@/lib/brevo";

export const EMAIL_TYPE_ZOOM_REMINDER = "zoom_reminder";
export const EMAIL_TYPE_RECORDING_PUBLISHED = "recording_published";

const EMAIL_STATUS_PROCESSING = "processing";
const EMAIL_STATUS_SENT = "sent";
const EMAIL_STATUS_FAILED = "failed";

const LIMA_TIME_ZONE = "America/Lima";
const DEFAULT_REMINDER_MINUTES_BEFORE = 30;
const REMINDER_WINDOW_MINUTES = 5;
const BREVO_TEMPLATE_ZOOM_REMINDER_ID = toPositiveInt(process.env.BREVO_TEMPLATE_ZOOM_REMINDER_ID, 337);
const BREVO_TEMPLATE_RECORDING_PUBLISHED_ID = toPositiveInt(
  process.env.BREVO_TEMPLATE_RECORDING_PUBLISHED_ID,
  338
);

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getReminderMinutesBefore() {
  return toPositiveInt(process.env.REMINDER_MINUTES_BEFORE, DEFAULT_REMINDER_MINUTES_BEFORE);
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function isDuplicateError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key");
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateInLima(value) {
  const date = toDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  if (!map.year || !map.month || !map.day) return "";
  return `${map.year}-${map.month}-${map.day}`;
}

function formatTimeInLima(value) {
  const date = toDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LIMA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  if (!map.hour || !map.minute) return "";
  return `${map.hour}:${map.minute}`;
}

function resolveStudentName(student) {
  const fullName = String(student?.full_name || "").trim();
  if (fullName) return fullName;
  const email = String(student?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return email || "Alumno";
}

function resolveClassTitle(session) {
  const explicitTitle = String(session?.day_label || "").trim();
  if (explicitTitle) return explicitTitle;
  const idx = Number.parseInt(String(session?.session_in_cycle || "").trim(), 10);
  if (Number.isFinite(idx) && idx > 0) return `Clase ${String(idx).padStart(2, "0")}`;
  return "Clase";
}

function resolveClassDate(session) {
  if (session?.starts_at) {
    const formatted = formatDateInLima(session.starts_at);
    if (formatted) return formatted;
  }
  const bySessionDate = String(session?.session_date || "").slice(0, 10);
  return bySessionDate || "";
}

function resolveClassTime(session) {
  return formatTimeInLima(session?.starts_at);
}

function resolveZoomLink(session) {
  const zoomLink = String(session?.zoom_link || "").trim();
  if (zoomLink) return zoomLink;
  return String(session?.live_link || "").trim();
}

function resolveCourseName(commission) {
  const level = String(commission?.course_level || "").trim();
  if (level) return level;
  return "Curso asignado";
}

function isSlidesSessionItem(item) {
  const type = String(item?.type || "").trim().toLowerCase();
  const url = String(item?.url || "").trim().toLowerCase();
  return type === "slides" || url.includes("docs.google.com/presentation");
}

function isPrimarySlideSessionItem(item) {
  const note = String(item?.note || "").trim().toLowerCase();
  return note === "primary_slide";
}

async function resolveSessionPresentationDriveLink(service, sessionId) {
  const safeSessionId = String(sessionId || "").trim();
  if (!safeSessionId) return "";

  const result = await service
    .from("session_items")
    .select("id, type, url, note, created_at")
    .eq("session_id", safeSessionId)
    .order("created_at", { ascending: true });

  if (result.error) {
    console.error("No se pudo cargar session_items para correo de grabacion", result.error);
    return "";
  }

  const items = (result.data || []).filter((item) => String(item?.url || "").trim());
  if (!items.length) return "";

  const slideItems = items.filter((item) => isSlidesSessionItem(item));
  const primarySlide = slideItems.find((item) => isPrimarySlideSessionItem(item)) || slideItems[0] || null;
  if (primarySlide?.url) {
    return String(primarySlide.url).trim();
  }

  return String(items[0]?.url || "").trim();
}

async function claimEmailLogEntry({ service, userId, sessionId, emailType, templateId }) {
  const nowIso = new Date().toISOString();
  const lookup = await service
    .from("email_log")
    .select("id, status")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("email_type", emailType)
    .maybeSingle();

  if (lookup.error) {
    throw lookup.error;
  }

  const existing = lookup.data || null;
  if (existing?.status === EMAIL_STATUS_SENT || existing?.status === EMAIL_STATUS_PROCESSING) {
    return { claimed: false, reason: existing.status, logId: existing.id };
  }

  if (existing?.id) {
    const updated = await service
      .from("email_log")
      .update({
        status: EMAIL_STATUS_PROCESSING,
        template_id: templateId,
        sent_at: null,
        error_message: null,
        updated_at: nowIso,
      })
      .eq("id", existing.id)
      .neq("status", EMAIL_STATUS_SENT)
      .neq("status", EMAIL_STATUS_PROCESSING)
      .select("id")
      .maybeSingle();
    if (updated.error) {
      throw updated.error;
    }
    if (!updated.data?.id) {
      return { claimed: false, reason: "locked", logId: existing.id };
    }
    return { claimed: true, reason: "reclaimed", logId: updated.data.id };
  }

  const inserted = await service
    .from("email_log")
    .insert({
      user_id: userId,
      session_id: sessionId,
      email_type: emailType,
      template_id: templateId,
      status: EMAIL_STATUS_PROCESSING,
      sent_at: null,
      error_message: null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  if (inserted.error) {
    if (isDuplicateError(inserted.error)) {
      return { claimed: false, reason: "duplicate", logId: null };
    }
    throw inserted.error;
  }

  return { claimed: true, reason: "inserted", logId: inserted.data?.id || null };
}

async function markEmailLogStatus({
  service,
  userId,
  sessionId,
  emailType,
  templateId,
  logId,
  status,
  errorMessage = null,
}) {
  const nowIso = new Date().toISOString();
  const payload = {
    status,
    template_id: templateId,
    sent_at: status === EMAIL_STATUS_SENT ? nowIso : null,
    error_message: errorMessage,
    updated_at: nowIso,
  };

  if (logId) {
    const updateResult = await service.from("email_log").update(payload).eq("id", logId);
    if (!updateResult.error) return;
  }

  await service.from("email_log").upsert(
    {
      user_id: userId,
      session_id: sessionId,
      email_type: emailType,
      created_at: nowIso,
      ...payload,
    },
    { onConflict: "user_id,session_id,email_type" }
  );
}

async function sendWithIdempotency({
  service,
  userId,
  toEmail,
  toName,
  sessionId,
  emailType,
  templateId,
  params,
}) {
  const claim = await claimEmailLogEntry({
    service,
    userId,
    sessionId,
    emailType,
    templateId,
  });

  if (!claim.claimed) {
    return { status: "skipped", reason: claim.reason };
  }

  try {
    await sendBrevoTemplateEmail({
      toEmail,
      toName,
      templateId,
      params,
    });
    await markEmailLogStatus({
      service,
      userId,
      sessionId,
      emailType,
      templateId,
      logId: claim.logId,
      status: EMAIL_STATUS_SENT,
    });
    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "No se pudo enviar email");
    await markEmailLogStatus({
      service,
      userId,
      sessionId,
      emailType,
      templateId,
      logId: claim.logId,
      status: EMAIL_STATUS_FAILED,
      errorMessage: message.slice(0, 600),
    });
    return { status: "failed", error: message };
  }
}

async function fetchCommissionStudents(service, commissionId) {
  if (!commissionId) return [];
  const result = await service
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("commission_id", commissionId)
    .eq("role", "student");
  if (result.error) {
    throw result.error;
  }
  return (result.data || []).filter((student) => String(student?.email || "").trim());
}

async function fetchCommissionsByIds(service, commissionIds) {
  const safeIds = Array.from(new Set((commissionIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (!safeIds.length) return new Map();
  const result = await service
    .from("course_commissions")
    .select("id, course_level, commission_number, modality_key, start_time")
    .in("id", safeIds);
  if (result.error) {
    throw result.error;
  }
  return new Map((result.data || []).map((row) => [String(row.id || "").trim(), row]));
}

async function fetchSessionsInReminderWindow(service, { startIso, endIso }) {
  const columns = [
    "id",
    "commission_id",
    "session_date",
    "session_in_cycle",
    "starts_at",
    "day_label",
    "live_link",
    "zoom_link",
    "status",
  ];
  let selected = [...columns];
  let lastError = null;

  for (let attempt = 0; attempt < columns.length; attempt += 1) {
    const result = await service
      .from("course_sessions")
      .select(selected.join(","))
      .not("starts_at", "is", null)
      .gte("starts_at", startIso)
      .lte("starts_at", endIso)
      .eq("status", "scheduled")
      .order("starts_at", { ascending: true });
    if (!result.error) {
      return result.data || [];
    }
    lastError = result.error;
    const missing = getMissingColumnFromError(result.error);
    if (!missing || !selected.includes(missing)) break;
    selected = selected.filter((column) => column !== missing);
  }

  throw lastError || new Error("No se pudieron cargar sesiones para recordatorio.");
}

async function fetchSessionById(service, sessionId) {
  const columns = [
    "id",
    "commission_id",
    "session_date",
    "session_in_cycle",
    "starts_at",
    "day_label",
    "live_link",
    "zoom_link",
    "recording_link",
    "recording_passcode",
    "recording_published_at",
    "status",
  ];
  let selected = [...columns];
  let lastError = null;

  for (let attempt = 0; attempt < columns.length; attempt += 1) {
    const result = await service
      .from("course_sessions")
      .select(selected.join(","))
      .eq("id", sessionId)
      .maybeSingle();
    if (!result.error) {
      return result.data || null;
    }
    lastError = result.error;
    const missing = getMissingColumnFromError(result.error);
    if (!missing || !selected.includes(missing)) break;
    selected = selected.filter((column) => column !== missing);
  }

  throw lastError || new Error("No se pudo cargar la sesion.");
}

async function sendZoomReminderForSession({ service, session, commission }) {
  const students = await fetchCommissionStudents(service, session?.commission_id);
  if (!students.length) {
    return {
      sessionId: session?.id || null,
      students: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: "no_students",
    };
  }

  const zoomLink = resolveZoomLink(session);
  if (!zoomLink) {
    return {
      sessionId: session?.id || null,
      students: students.length,
      sent: 0,
      failed: 0,
      skipped: students.length,
      skippedReason: "missing_zoom_link",
    };
  }

  const classTitle = resolveClassTitle(session);
  const classDate = resolveClassDate(session);
  const classTime = resolveClassTime(session);
  const courseName = resolveCourseName(commission);

  const summary = {
    sessionId: session?.id || null,
    students: students.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    skippedReason: null,
  };

  for (const student of students) {
    const studentName = resolveStudentName(student);
    const result = await sendWithIdempotency({
      service,
      userId: student.id,
      toEmail: student.email,
      toName: studentName,
      sessionId: session.id,
      emailType: EMAIL_TYPE_ZOOM_REMINDER,
      templateId: BREVO_TEMPLATE_ZOOM_REMINDER_ID,
      params: {
        name: studentName,
        zoom_link: zoomLink,
        course: courseName,
        class_title: classTitle,
        class_date: classDate,
        class_time: classTime,
      },
    });
    if (result.status === "sent") summary.sent += 1;
    else if (result.status === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }

  return summary;
}

export async function processUpcomingZoomReminderEmails({ service, now = new Date() }) {
  if (!service) {
    throw new Error("Se requiere un cliente Supabase para procesar recordatorios.");
  }

  const reminderMinutesBefore = getReminderMinutesBefore();
  const safeLowerOffset = Math.max(reminderMinutesBefore - REMINDER_WINDOW_MINUTES, 0);
  const safeUpperOffset = reminderMinutesBefore + REMINDER_WINDOW_MINUTES;
  const windowStart = new Date(now.getTime() + safeLowerOffset * 60 * 1000);
  const windowEnd = new Date(now.getTime() + safeUpperOffset * 60 * 1000);

  const sessions = await fetchSessionsInReminderWindow(service, {
    startIso: windowStart.toISOString(),
    endIso: windowEnd.toISOString(),
  });

  const commissionMap = await fetchCommissionsByIds(
    service,
    sessions.map((session) => session.commission_id)
  );

  const totals = {
    reminderMinutesBefore,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    sessionsEvaluated: sessions.length,
    studentsTargeted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    sessionsWithoutZoomLink: 0,
  };

  for (const session of sessions) {
    const commission = commissionMap.get(String(session?.commission_id || "").trim()) || null;
    const summary = await sendZoomReminderForSession({
      service,
      session,
      commission,
    });
    totals.studentsTargeted += summary.students || 0;
    totals.sent += summary.sent || 0;
    totals.failed += summary.failed || 0;
    totals.skipped += summary.skipped || 0;
    if (summary.skippedReason === "missing_zoom_link") {
      totals.sessionsWithoutZoomLink += 1;
    }
  }

  return totals;
}

export async function sendZoomReminderEmailsForSession({ service, sessionId }) {
  if (!service) {
    throw new Error("Se requiere un cliente Supabase para enviar recordatorios.");
  }

  const safeSessionId = String(sessionId || "").trim();
  if (!safeSessionId) {
    return {
      sessionId: null,
      students: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: "invalid_session",
    };
  }

  const session = await fetchSessionById(service, safeSessionId);
  if (!session) {
    return {
      sessionId: safeSessionId,
      students: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: "session_not_found",
    };
  }

  const commissionMap = await fetchCommissionsByIds(service, [session.commission_id]);
  const commission = commissionMap.get(String(session?.commission_id || "").trim()) || null;
  return sendZoomReminderForSession({
    service,
    session,
    commission,
  });
}

export async function sendRecordingPublishedEmailsForSession({ service, sessionId }) {
  if (!service) {
    throw new Error("Se requiere un cliente Supabase para notificar grabaciones.");
  }
  const safeSessionId = String(sessionId || "").trim();
  if (!safeSessionId) {
    return {
      sessionId: null,
      students: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: "invalid_session",
    };
  }

  const session = await fetchSessionById(service, safeSessionId);
  if (!session) {
    return {
      sessionId: safeSessionId,
      students: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: "session_not_found",
    };
  }

  const recordingLink = String(session?.recording_link || "").trim();
  const recordingPasscode = String(session?.recording_passcode || "").trim();
  if (!recordingLink || !recordingPasscode) {
    return {
      sessionId: safeSessionId,
      students: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: "missing_recording_data",
    };
  }

  const commissionMap = await fetchCommissionsByIds(service, [session.commission_id]);
  const commission = commissionMap.get(String(session?.commission_id || "").trim()) || null;
  const students = await fetchCommissionStudents(service, session?.commission_id);

  if (!students.length) {
    return {
      sessionId: safeSessionId,
      students: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: "no_students",
    };
  }

  const classTitle = resolveClassTitle(session);
  const courseName = resolveCourseName(commission);
  const presentationDriveLink = await resolveSessionPresentationDriveLink(service, safeSessionId);

  const summary = {
    sessionId: safeSessionId,
    students: students.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    skippedReason: null,
  };

  for (const student of students) {
    const studentName = resolveStudentName(student);
    const result = await sendWithIdempotency({
      service,
      userId: student.id,
      toEmail: student.email,
      toName: studentName,
      sessionId: safeSessionId,
      emailType: EMAIL_TYPE_RECORDING_PUBLISHED,
      templateId: BREVO_TEMPLATE_RECORDING_PUBLISHED_ID,
      params: {
        name: studentName,
        recording_link: recordingLink,
        recording_passcode: recordingPasscode,
        presentation_drive_link: presentationDriveLink,
        course: courseName,
        class_title: classTitle,
      },
    });
    if (result.status === "sent") summary.sent += 1;
    else if (result.status === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }

  return summary;
}
