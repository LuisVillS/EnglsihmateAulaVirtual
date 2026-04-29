import { NextResponse } from "next/server";
import { UNIFIED_COURSE_PRICE, normalizeUnifiedCourseType } from "@/lib/course-config";
import { isPeruvianMobileNumber, validateCrmPhoneInput } from "@/lib/crm/phones";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { ensureReservationStatus, getPreEnrollment } from "@/lib/pre-enrollment";
import { deletePaymentProof, getPaymentProofBucket, uploadPaymentProof } from "@/lib/proof-storage";

function sanitizeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
}

function isAllowedProofMime(type) {
  if (!type) return false;
  return type.startsWith("image/") || type === "application/pdf";
}

function mapStorageError(error) {
  const message = String(error?.message || "");
  return message || "No se pudo subir el comprobante.";
}

function normalizeText(value) {
  return value?.toString().trim() || "";
}

export async function POST(request) {
  try {
    const userId = await resolvePreEnrollmentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const preEnrollment = await ensureReservationStatus(await getPreEnrollment(userId));
    if (!preEnrollment) {
      return NextResponse.json({ error: "Proceso no iniciado." }, { status: 400 });
    }

    if (preEnrollment.status === "EXPIRED") {
      return NextResponse.json({ error: "La reserva ha expirado." }, { status: 409 });
    }

    if (["PAYMENT_SUBMITTED", "PAID_AUTO"].includes(preEnrollment.status)) {
      return NextResponse.json(
        { error: "Tu matricula ya fue enviada y esta en revision." },
        { status: 409 }
      );
    }

    const formData = await request.formData();
    const paymentMethodRaw = normalizeText(formData.get("paymentMethod")).toUpperCase();
    const validMethods = new Set(["MERCADOPAGO", "YAPE_PLIN"]);
    const paymentMethod = validMethods.has(paymentMethodRaw) ? paymentMethodRaw : "";
    if (!paymentMethod) {
      return NextResponse.json({ error: "Selecciona un metodo de pago valido." }, { status: 400 });
    }
    const confirmationModeRaw = normalizeText(formData.get("paymentConfirmationMode")).toUpperCase();
    const validConfirmationModes = new Set(["OPERATION", "PROOF"]);
    const confirmationMode = validConfirmationModes.has(confirmationModeRaw) ? confirmationModeRaw : "";
    if (!confirmationMode) {
      return NextResponse.json({ error: "Selecciona como deseas confirmar el pago." }, { status: 400 });
    }
    const operationCode = normalizeText(formData.get("operationCode"));
    const payerName = normalizeText(formData.get("payerName"));
    const payerPhone = normalizeText(formData.get("payerPhone"));
    const payerPhoneCountryCode = normalizeText(formData.get("payerPhoneCountryCode"));
    const payerPhoneNationalNumber = normalizeText(formData.get("payerPhoneNationalNumber"));
    const payerPhoneDialable = normalizeText(formData.get("payerPhoneDialable"));
    const file = formData.get("file");
    const hasFile = file instanceof File && file.size > 0;
    const payerPhoneValidation = validateCrmPhoneInput(
      {
        phone: payerPhoneDialable || payerPhone,
        phoneCountryCode: payerPhoneCountryCode,
        phoneNationalNumber: payerPhoneNationalNumber,
        phoneE164: payerPhoneDialable,
      },
      {
        required: paymentMethod === "YAPE_PLIN" && confirmationMode === "OPERATION",
        defaultCountryCode: "+51",
      }
    );

    if (hasFile && !isAllowedProofMime(file.type)) {
      return NextResponse.json({ error: "Solo se permiten imagenes o PDF." }, { status: 400 });
    }

    if (
      paymentMethod === "YAPE_PLIN" &&
      confirmationMode === "OPERATION" &&
      (!payerName || !payerPhone)
    ) {
      return NextResponse.json(
        { error: "En Yape/Plin el nombre y telefono del pagador son obligatorios." },
        { status: 400 }
      );
    }
    if (!payerPhoneValidation.isValid) {
      return NextResponse.json(
        { error: payerPhoneValidation.validationErrors[0] || "Telefono de pagador invalido." },
        { status: 400 }
      );
    }
    if (
      paymentMethod === "YAPE_PLIN" &&
      (payerPhoneValidation.phoneCountryCode !== "+51" ||
        !isPeruvianMobileNumber(payerPhoneValidation.phoneNationalNumber))
    ) {
      return NextResponse.json(
        { error: "En Yape/Plin solo se aceptan celulares peruanos validos." },
        { status: 400 }
      );
    }

    if (confirmationMode === "OPERATION" && paymentMethod === "MERCADOPAGO" && !operationCode) {
      return NextResponse.json({ error: "Ingresa el numero de operacion para confirmar el pago." }, { status: 400 });
    }

    if (confirmationMode === "PROOF" && !hasFile) {
      return NextResponse.json({ error: "Adjunta una captura para confirmar el pago." }, { status: 400 });
    }

    let key = preEnrollment.payment_proof_url || null;
    if (hasFile && confirmationMode === "PROOF") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const sanitized = sanitizeFileName(file.name || "comprobante");
      key = `pre-enrollments/${userId}/${Date.now()}-${sanitized}`;
      await uploadPaymentProof({
        key,
        buffer,
        contentType: file.type || "application/octet-stream",
      });
      if (preEnrollment.payment_proof_url && preEnrollment.payment_proof_url !== key) {
        try {
          await deletePaymentProof(preEnrollment.payment_proof_url);
        } catch (deleteError) {
          console.warn("[Matricula] no se pudo eliminar comprobante anterior", deleteError);
        }
      }
    } else if (confirmationMode === "OPERATION" && preEnrollment.payment_proof_url) {
      try {
        await deletePaymentProof(preEnrollment.payment_proof_url);
      } catch (deleteError) {
        console.warn("[Matricula] no se pudo eliminar comprobante al cambiar de metodo", deleteError);
      }
      key = null;
    }

    const service = getServiceSupabaseClient();
    const previousMeta =
      preEnrollment?.payment_proof_meta && typeof preEnrollment.payment_proof_meta === "object"
        ? preEnrollment.payment_proof_meta
        : {};
    const paymentProofMeta = {
      ...previousMeta,
      operation_code: operationCode || null,
      payer_name: payerName || null,
      payer_phone: payerPhoneValidation.phoneE164 || null,
      payer_phone_country_code: payerPhoneValidation.phoneCountryCode || null,
      payer_phone_national_number: payerPhoneValidation.phoneNationalNumber || null,
      payer_phone_e164: payerPhoneValidation.phoneE164 || null,
      payer_phone_raw_input: payerPhone || null,
      confirmation_mode: confirmationMode,
      method: paymentMethod,
      storage: "supabase",
      bucket: getPaymentProofBucket(),
      name: hasFile && confirmationMode === "PROOF" ? file.name : null,
      size: hasFile && confirmationMode === "PROOF" ? file.size : null,
      type: hasFile && confirmationMode === "PROOF" ? file.type : null,
    };

    const { data: updated, error } = await service
      .from("pre_enrollments")
      .update({
        selected_course_type: normalizeUnifiedCourseType(preEnrollment.selected_course_type),
        price_total: UNIFIED_COURSE_PRICE,
        payment_method: paymentMethod,
        payment_proof_url: key,
        payment_proof_meta: paymentProofMeta,
        payment_submitted_at: new Date().toISOString(),
        mp_payment_id: paymentMethod === "MERCADOPAGO" ? operationCode || preEnrollment.mp_payment_id || null : null,
        mp_status: paymentMethod === "MERCADOPAGO" ? "REPORTED_BY_STUDENT" : null,
        status: "PAYMENT_SUBMITTED",
        reservation_expires_at: null,
        step: "PAYMENT",
        updated_at: new Date().toISOString(),
      })
      .eq("id", preEnrollment.id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "No se pudo guardar el comprobante.");
    }

    return NextResponse.json({ preEnrollment: updated });
  } catch (error) {
    console.error("[Matricula] upload proof error", error);
    return NextResponse.json({ error: mapStorageError(error) }, { status: 400 });
  }
}
