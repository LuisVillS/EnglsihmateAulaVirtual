import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

export async function GET(request, { params }) {
  void request;
  const resolvedParams = await params;
  const preEnrollmentId = resolvedParams?.id?.toString();
  if (!preEnrollmentId) {
    return NextResponse.json({ error: "Pre-matricula invalida." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    return NextResponse.json({ error: "Solo admins." }, { status: 403 });
  }

  const client = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
  const { data: preEnrollment } = await client
    .from("pre_enrollments")
    .select("*")
    .eq("id", preEnrollmentId)
    .maybeSingle();

  if (!preEnrollment) {
    return NextResponse.json({ error: "Pre-matricula no encontrada." }, { status: 404 });
  }

  const { data: profile } = await client
    .from("profiles")
    .select("id, full_name, email, phone, student_code")
    .eq("id", preEnrollment.user_id)
    .maybeSingle();

  const { data: schedule } = preEnrollment.selected_schedule_id
    ? await client
        .from("course_commissions")
        .select("id, course_level, commission_number, start_date, end_date, start_time, end_time, modality_key")
        .eq("id", preEnrollment.selected_schedule_id)
        .maybeSingle()
    : { data: null };

  const paymentMeta =
    preEnrollment.payment_proof_meta && typeof preEnrollment.payment_proof_meta === "object"
      ? preEnrollment.payment_proof_meta
      : {};

  return NextResponse.json({
    detail: {
      preEnrollment,
      profile: profile || null,
      schedule: schedule || null,
      paymentMeta: {
        confirmationMode: paymentMeta.confirmation_mode || null,
        operationCode: paymentMeta.operation_code || preEnrollment.mp_payment_id || null,
        payerName: paymentMeta.payer_name || null,
        payerPhone: paymentMeta.payer_phone || null,
      },
    },
  });
}
