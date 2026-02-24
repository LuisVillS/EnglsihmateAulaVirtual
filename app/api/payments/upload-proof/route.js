import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { resolveCourseRenewalContext } from "@/lib/payments";
import { uploadPaymentProof } from "@/lib/proof-storage";

function sanitizeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
}

function isAllowedMime(type) {
  return type?.startsWith("image/") || type === "application/pdf";
}

function mapStorageError(error) {
  const message = String(error?.message || "");
  return message || "No se pudo subir comprobante.";
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const quotedMatch = message.match(/'([^']+)'/);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

async function getCommissionSessionsForRenewal(service, commissionId) {
  if (!commissionId) return [];
  const baseColumns = ["id", "cycle_month", "session_in_cycle", "session_date", "starts_at", "ends_at"];
  let columns = [...baseColumns];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const query = service.from("course_sessions").select(columns.join(",")).eq("commission_id", commissionId);
    if (columns.includes("starts_at")) {
      query.order("starts_at", { ascending: true, nullsFirst: false });
    }
    if (columns.includes("session_date")) {
      query.order("session_date", { ascending: true });
    }
    const result = await query;
    if (!result.error) {
      return result.data || [];
    }
    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !columns.includes(missingColumn)) {
      console.error("No se pudieron listar sesiones para renovacion mensual", result.error);
      return [];
    }
    columns = columns.filter((column) => column !== missingColumn);
  }
  return [];
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const service = getServiceSupabaseClient();
    const { data: profile } = await service
      .from("profiles")
      .select("id, role, is_premium, commission_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.id) {
      return NextResponse.json({ error: "Perfil invalido." }, { status: 400 });
    }
    if (profile.role !== "student") {
      return NextResponse.json({ error: "Solo alumnos matriculados pueden subir pagos mensuales." }, { status: 403 });
    }
    if (!profile.commission_id) {
      return NextResponse.json({ error: "No tienes una comision activa para renovar." }, { status: 403 });
    }

    const { data: commission } = await service
      .from("course_commissions")
      .select("start_date, end_date")
      .eq("id", profile.commission_id)
      .maybeSingle();

    const commissionSessions = await getCommissionSessionsForRenewal(service, profile.commission_id);
    const renewal = resolveCourseRenewalContext({
      now: new Date(),
      courseStartDate: commission?.start_date || null,
      courseEndDate: commission?.end_date || null,
      sessions: commissionSessions,
      preOpenHours: 24,
    });

    if (!renewal.canRenewSameCourse) {
      return NextResponse.json(
        { error: "Tu curso actual no admite mas renovaciones mensuales. Inicia una nueva matricula." },
        { status: 403 }
      );
    }

    if (!renewal.canPayNow) {
      const enabledFromLabel = renewal.enabledFrom?.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      return NextResponse.json(
        { error: `El pago mensual aun no esta habilitado. Se activa el ${enabledFromLabel || "-"}.` },
        { status: 403 }
      );
    }
    const billingMonth = renewal.nextBillingMonthKey;
    if (!billingMonth) {
      return NextResponse.json({ error: "No se pudo determinar el mes de renovacion." }, { status: 400 });
    }

    const { data: existingPayment } = await service
      .from("payments")
      .select("id, status")
      .eq("student_id", profile.id)
      .eq("billing_month", billingMonth)
      .maybeSingle();

    if (existingPayment?.status === "submitted") {
      return NextResponse.json({ error: "Tu matricula ya fue enviada y esta en revision." }, { status: 409 });
    }

    if (existingPayment?.status === "approved") {
      return NextResponse.json({ error: "Tu matricula del siguiente mes ya fue aprobada." }, { status: 409 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta un archivo valido." }, { status: 400 });
    }
    if (!isAllowedMime(file.type)) {
      return NextResponse.json({ error: "Solo imagenes o PDF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safe = sanitizeFileName(file.name || "comprobante");
    const key = `monthly-payments/${profile.id}/${Date.now()}-${safe}`;
    await uploadPaymentProof({
      key,
      buffer,
      contentType: file.type || "application/octet-stream",
    });

    const amount = profile.is_premium ? 139 : 99;
    const { data: payment, error } = await service
      .from("payments")
      .upsert(
        {
          student_id: profile.id,
          billing_month: billingMonth,
          amount_soles: amount,
          status: "submitted",
          receipt_url: key,
        },
        { onConflict: "student_id,billing_month" }
      )
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "No se pudo registrar el pago.");
    }

    return NextResponse.json({ ok: true, payment });
  } catch (error) {
    console.error("[Payments] upload error", error);
    return NextResponse.json({ error: mapStorageError(error) }, { status: 400 });
  }
}
