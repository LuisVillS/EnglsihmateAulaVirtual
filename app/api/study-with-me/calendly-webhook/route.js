import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import {
  STUDY_WITH_ME_SESSION_MINUTES,
  getLimaWeekStartKey,
} from "@/lib/study-with-me-access";

function isAuthorizedWebhook(request) {
  const configuredSecret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!configuredSecret) return true;

  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret") || "";
  const headerSecret =
    request.headers.get("x-study-with-me-secret") ||
    request.headers.get("x-webhook-secret") ||
    "";

  return querySecret === configuredSecret || headerSecret === configuredSecret;
}

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

async function markCancelledSession({ service, eventUri, inviteeUri }) {
  const payload = { status: "cancelled", updated_at: new Date().toISOString() };
  if (eventUri) {
    await service.from("study_with_me_sessions").update(payload).eq("calendly_event_uri", eventUri);
  }
  if (inviteeUri) {
    await service.from("study_with_me_sessions").update(payload).eq("calendly_invitee_uri", inviteeUri);
  }
}

export async function POST(request) {
  try {
    if (!isAuthorizedWebhook(request)) {
      return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
    }

    const body = await request.json();
    const webhookEvent = String(body?.event || "").toLowerCase();
    const payload = body?.payload || {};
    const invitee = payload?.invitee || {};
    const calendlyEvent = payload?.event || {};

    const inviteeEmail = toSafeLower(invitee?.email || invitee?.email_address);
    const calendlyEventUri = String(calendlyEvent?.uri || payload?.event_uri || "").trim();
    const calendlyInviteeUri = String(invitee?.uri || payload?.invitee_uri || "").trim();

    const service = getServiceSupabaseClient();

    if (webhookEvent === "invitee.canceled") {
      await markCancelledSession({
        service,
        eventUri: calendlyEventUri,
        inviteeUri: calendlyInviteeUri,
      });
      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    if (webhookEvent !== "invitee.created") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const student = await findStudentProfileByEmail(service, inviteeEmail);
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

    const result = calendlyEventUri
      ? await service.from("study_with_me_sessions").upsert(row, { onConflict: "calendly_event_uri" })
      : await service.from("study_with_me_sessions").insert(row);

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
    console.error("[StudyWithMe] webhook error", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
