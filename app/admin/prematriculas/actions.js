"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { saveStudentProfile } from "@/lib/students";
import { sendEnrollmentEmail } from "@/lib/brevo";
import { deletePaymentProof, isSupabaseStorageKey } from "@/lib/proof-storage";
import { formatBillingMonth, getCurrentBillingMonthDate } from "@/lib/payments";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No autenticado");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    throw new Error("Solo admins");
  }

  return { supabase, adminId: adminRecord.id };
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getMonthKey(value) {
  const raw = value?.toString().trim();
  if (!raw) return null;

  const directMatch = raw.match(/^(\d{4})-(\d{2})/);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeyToBillingMonth(monthKey) {
  if (!monthKey) return null;
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

export async function approvePreEnrollment(formData) {
  const preEnrollmentId = formData.get("preEnrollmentId")?.toString();
  if (!preEnrollmentId) {
    return { error: "Pre-matricula invalida." };
  }

  const { adminId } = await requireAdmin();
  if (!hasServiceRoleClient()) {
    return { error: "Configura SUPABASE_SERVICE_ROLE_KEY para aprobar." };
  }

  const service = getServiceSupabaseClient();
  let { data: preEnrollment } = await service
    .from("pre_enrollments")
    .select("*")
    .eq("id", preEnrollmentId)
    .maybeSingle();

  if (!preEnrollment) {
    return { error: "Pre-matricula no encontrada." };
  }

  const hasSubmittedPayment =
    ["PAYMENT_SUBMITTED", "PAID_AUTO"].includes(preEnrollment.status) ||
    Boolean(preEnrollment.payment_submitted_at) ||
    Boolean(preEnrollment.payment_proof_url) ||
    (preEnrollment.payment_method === "MERCADOPAGO" && Boolean(preEnrollment.mp_payment_id));

  if (!hasSubmittedPayment) {
    return { error: "El pago aun no ha sido confirmado." };
  }

  if (!["PAYMENT_SUBMITTED", "PAID_AUTO"].includes(preEnrollment.status)) {
    const { data: normalizedPreEnrollment } = await service
      .from("pre_enrollments")
      .update({
        status: "PAYMENT_SUBMITTED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", preEnrollment.id)
      .select("*")
      .maybeSingle();
    if (normalizedPreEnrollment) {
      preEnrollment = normalizedPreEnrollment;
    }
  }

  const { data: profile } = await service
    .from("profiles")
    .select("id, email, full_name, student_code, phone, birth_date")
    .eq("id", preEnrollment.user_id)
    .maybeSingle();

  if (!profile) {
    return { error: "No se encontro el usuario." };
  }

  let schedule = null;
  if (preEnrollment.selected_schedule_id) {
    const { data } = await service
      .from("course_commissions")
      .select("id, start_time, start_date, course_level, modality_key")
      .eq("id", preEnrollment.selected_schedule_id)
      .maybeSingle();
    schedule = data || null;
  }

  if (preEnrollment.start_month) {
    const requestedStartMonth = getMonthKey(preEnrollment.start_month);
    const scheduleStartMonth = getMonthKey(schedule?.start_date);
    if (!requestedStartMonth || !scheduleStartMonth || requestedStartMonth !== scheduleStartMonth) {
      return {
        error:
          "No se puede aprobar: no existe una comision para el mes de inicio seleccionado. Solicita al alumno volver a elegir horario.",
      };
    }
  }

  try {
    await saveStudentProfile({
      profileId: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
      birthDate: profile.birth_date,
      courseLevel: preEnrollment.selected_level || schedule?.course_level || null,
      levelNumber: 1,
      isPremium: preEnrollment.selected_course_type === "PREMIUM",
      startMonth: preEnrollment.start_month || null,
      enrollmentDate: schedule?.start_date || null,
      preferredHour: parseTimeToMinutes(schedule?.start_time),
      commissionId: preEnrollment.selected_schedule_id || null,
      modalityKey: schedule?.modality_key || null,
      sendWelcomeEmail: false,
      forcePasswordReset: false,
      studentStatus: "enrolled",
    });
  } catch (error) {
    console.error("No se pudo asignar alumno", error);
    return { error: error.message || "No se pudo matricular." };
  }

  if (preEnrollment.selected_course_id) {
    await service
      .from("course_enrollments")
      .upsert(
        { user_id: profile.id, course_id: preEnrollment.selected_course_id },
        { onConflict: "user_id,course_id" }
      );
  }

  const nowIso = new Date().toISOString();
  const requestedStartMonth = getMonthKey(preEnrollment.start_month || schedule?.start_date || "");
  const currentBillingMonth =
    monthKeyToBillingMonth(requestedStartMonth) || formatBillingMonth(getCurrentBillingMonthDate(new Date()));
  const monthlyAmount = preEnrollment.selected_course_type === "PREMIUM" ? 139 : 99;

  const paymentPayload = {
    student_id: profile.id,
    billing_month: currentBillingMonth,
    amount_soles: monthlyAmount,
    status: "approved",
    approved_at: nowIso,
    approved_screen_seen: false,
    approved_screen_seen_at: null,
  };

  let paymentResult = await service
    .from("payments")
    .upsert(paymentPayload, { onConflict: "student_id,billing_month" });

  const paymentErrorMessage = String(paymentResult.error?.message || "");
  const lowerPaymentErrorMessage = paymentErrorMessage.toLowerCase();
  const hasMissingNewColumns =
    paymentErrorMessage.includes("approved_at") ||
    paymentErrorMessage.includes("approved_screen_seen") ||
    paymentErrorMessage.includes("approved_screen_seen_at");
  const missingPaymentsTable =
    lowerPaymentErrorMessage.includes("could not find the table") &&
      lowerPaymentErrorMessage.includes("public.payments") ||
    lowerPaymentErrorMessage.includes("relation \"payments\" does not exist");

  if (paymentResult.error && hasMissingNewColumns) {
    paymentResult = await service
      .from("payments")
      .upsert(
        {
          student_id: profile.id,
          billing_month: currentBillingMonth,
          amount_soles: monthlyAmount,
          status: "approved",
        },
        { onConflict: "student_id,billing_month" }
      );
  }

  if (paymentResult.error && missingPaymentsTable) {
    console.warn("[Prematriculas] tabla payments no encontrada; se continua aprobacion en modo compatibilidad.");
    paymentResult = { error: null };
  }

  if (paymentResult.error) {
    return { error: paymentResult.error.message || "No se pudo registrar el pago del mes." };
  }

  await service
    .from("pre_enrollments")
    .update({
      status: "APPROVED",
      reservation_expires_at: null,
      reviewed_by: adminId,
      reviewed_at: nowIso,
      payment_proof_url: null,
      review_notes: null,
      updated_at: nowIso,
    })
    .eq("id", preEnrollment.id);

  if (preEnrollment.payment_proof_url && isSupabaseStorageKey(preEnrollment.payment_proof_url)) {
    try {
      await deletePaymentProof(preEnrollment.payment_proof_url);
    } catch (storageError) {
      console.warn("No se pudo eliminar comprobante tras aprobar", storageError);
    }
  }

  await service.from("profiles").update({ invited: true }).eq("id", profile.id);

  try {
    await sendEnrollmentEmail({
      toEmail: profile.email,
      name: profile.full_name || profile.email,
      course: preEnrollment.selected_level || "Curso asignado",
      schedule: schedule?.start_time || "Horario por confirmar",
      studentCode: profile.student_code,
      tempPassword: "",
    });
  } catch (error) {
    console.error("No se pudo enviar correo de matricula", error);
  }

  revalidatePath("/admin/prematriculas");
  revalidatePath(`/admin/prematriculas/${preEnrollment.id}`);
  return { success: true };
}

export async function rejectPreEnrollment(formData) {
  const preEnrollmentId = formData.get("preEnrollmentId")?.toString();
  const notes = formData.get("reviewNotes")?.toString() || "";
  if (!preEnrollmentId) {
    return { error: "Pre-matricula invalida." };
  }

  const { adminId } = await requireAdmin();
  if (!hasServiceRoleClient()) {
    return { error: "Configura SUPABASE_SERVICE_ROLE_KEY para rechazar." };
  }

  const service = getServiceSupabaseClient();
  await service
    .from("pre_enrollments")
    .update({
      status: "REJECTED",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", preEnrollmentId);

  revalidatePath("/admin/prematriculas");
  revalidatePath(`/admin/prematriculas/${preEnrollmentId}`);
  return { success: true };
}
