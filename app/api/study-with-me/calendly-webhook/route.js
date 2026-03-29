import { NextResponse } from "next/server.js";
import { requirePrivateServerEnv } from "../../../../lib/security/env.js";
import {
  STUDY_WITH_ME_SESSION_MINUTES,
  getLimaWeekStartKey,
} from "../../../../lib/webhooks/calendly.js";
import { resolveWebhookService } from "../../../../lib/webhooks/service.js";
import {
  verifyCalendlyWebhookSignature,
  verifyLegacyWebhookSecret,
} from "../../../../lib/webhooks/security.js";

function toSafeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function parseIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function durationMinutesBetween(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return Number.NaN;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

async function findStudentProfileByEmail(service, email) {
  if (!email) return null;
  const { data } = await service
    .from("profiles")
    .select("id, role, commission_id")
    .eq("email", email)
    .maybeSingle();
  if (!data?.id || data.role !== "student") return null;
  return data;
}

async function findExistingSession(service, { eventUri, inviteeUri }) {
  if (!eventUri && !inviteeUri) return null;

  let query = service
    .from("study_with_me_sessions")
    .select("id, status, starts_at, ends_at, calendly_event_uri, calendly_invitee_uri");

  if (eventUri) {
    query = query.eq("calendly_event_uri", eventUri).maybeSingle();
  } else {
    query = query.eq("calendly_invitee_uri", inviteeUri).maybeSingle();
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "No se pudo revisar la sesion existente.");
  }

  return data || null;
}

async function markCancelledSession({ service, eventUri, inviteeUri }) {
  const payload = { status: "cancelled", updated_at: new Date().toISOString() };
  if (eventUri) {
    await service.from("study_with_me_sessions").update(payload).eq("calendly_event_uri", eventUri);
  }
  if (inviteeUri) {
    await service.from("study_with_me_sessions").update(payload).eq("calendly_invitee_uri", inviteeUri);
  }
}

export async function handleCalendlyWebhook(request, { service = null, env = process.env } = {}) {
  try {
    const secret = requirePrivateServerEnv("CALENDLY_WEBHOOK_SECRET", {
      env,
      label: "CALENDLY_WEBHOOK_SECRET",
    });

    const rawBody = await request.text();
    const body = rawBody ? JSON.parse(rawBody) : {};
    const webhookEvent = String(body?.event || "").toLowerCase();
    const payload = body?.payload || {};
    const invitee = payload?.invitee || {};
    const calendlyEvent = payload?.event || {};
    const inviteeEmail = toSafeLower(invitee?.email || invitee?.email_address);
    const calendlyEventUri = String(calendlyEvent?.uri || payload?.event_uri || "").trim();
    const calendlyInviteeUri = String(invitee?.uri || payload?.invitee_uri || "").trim();

    const signatureHeader =
      request.headers.get("calendly-webhook-signature") ||
      request.headers.get("x-calendly-webhook-signature") ||
      request.headers.get("x-calendly-signature") ||
      "";

    if (signatureHeader) {
      const signatureCheck = verifyCalendlyWebhookSignature({
        signatureHeader,
        rawBody,
        secret,
      });
      if (!signatureCheck.valid) {
        return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
      }
    } else {
      const legacyCheck = verifyLegacyWebhookSecret({
        request,
        expectedSecret: secret,
        headerNames: ["x-study-with-me-secret", "x-webhook-secret"],
        queryParamNames: ["secret"],
      });
      if (!legacyCheck.valid) {
        return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
      }
    }

    const db = await resolveWebhookService(service);

    if (webhookEvent === "invitee.canceled") {
      const existing = await findExistingSession(db, {
        eventUri: calendlyEventUri,
        inviteeUri: calendlyInviteeUri,
      });
      if (existing?.status === "cancelled") {
        return NextResponse.json({ ok: true, deduped: true, status: "cancelled" });
      }

      await markCancelledSession({
        service: db,
        eventUri: calendlyEventUri,
        inviteeUri: calendlyInviteeUri,
      });
      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    if (webhookEvent !== "invitee.created") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const student = await findStudentProfileByEmail(db, inviteeEmail);
    if (!student?.id) {
      return NextResponse.json({ ok: true, ignored: true, reason: "student-not-found" });
    }

    const startsAt = parseIsoDate(calendlyEvent?.start_time || payload?.start_time);
    const endsAt = parseIsoDate(calendlyEvent?.end_time || payload?.end_time);
    if (!startsAt || !endsAt) {
      return NextResponse.json({ error: "Fechas de sesion invalidas." }, { status: 400 });
    }

    const durationMinutes = durationMinutesBetween(startsAt, endsAt);
    if (durationMinutes !== STUDY_WITH_ME_SESSION_MINUTES) {
      return NextResponse.json(
        { error: `Duracion invalida. Se esperaban ${STUDY_WITH_ME_SESSION_MINUTES} minutos.` },
        { status: 400 }
      );
    }

    const weekStartKey = getLimaWeekStartKey(startsAt);
    if (!weekStartKey) {
      return NextResponse.json({ error: "No se pudo calcular semana de sesion." }, { status: 400 });
    }

    const row = {
      student_id: student.id,
      commission_id: student.commission_id || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      week_start: weekStartKey,
      status: "scheduled",
      calendly_event_uri: calendlyEventUri || null,
      calendly_invitee_uri: calendlyInviteeUri || null,
      source: "calendly_webhook",
      updated_at: new Date().toISOString(),
    };

    const existing = await findExistingSession(db, {
      eventUri: calendlyEventUri,
      inviteeUri: calendlyInviteeUri,
    });

    if (
      existing &&
      existing.status === "scheduled" &&
      String(existing.calendly_event_uri || "") === String(row.calendly_event_uri || "") &&
      String(existing.calendly_invitee_uri || "") === String(row.calendly_invitee_uri || "") &&
      String(existing.starts_at || "") === String(row.starts_at || "") &&
      String(existing.ends_at || "") === String(row.ends_at || "")
    ) {
      return NextResponse.json({ ok: true, deduped: true, status: "scheduled" });
    }

    const result = calendlyEventUri
      ? await db.from("study_with_me_sessions").upsert(row, { onConflict: "calendly_event_uri" })
      : existing?.id
        ? await db.from("study_with_me_sessions").update(row).eq("id", existing.id)
        : await db.from("study_with_me_sessions").insert(row);

    if (result.error) {
      const missingTable = getMissingTableName(result.error);
      if (missingTable?.endsWith("study_with_me_sessions")) {
        return NextResponse.json({ ok: true, ignored: true, reason: "table-missing" });
      }

      const errorMessage = String(result.error.message || "");
      if (errorMessage.includes("study_with_me_sessions_student_week_unique")) {
        return NextResponse.json({ ok: true, ignored: true, reason: "weekly-limit-reached" });
      }

      console.error("No se pudo registrar sesion Study With Me", result.error);
      return NextResponse.json({ error: "No se pudo registrar la sesion." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Webhook payload invalido." }, { status: 400 });
    }

    console.error("[StudyWithMe] webhook error", error);
    const message = error?.message || "Webhook error";
    const status = message.includes("no esta configurada") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request) {
  return handleCalendlyWebhook(request);
}
