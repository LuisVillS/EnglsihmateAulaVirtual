import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { createEmailVerificationToken } from "@/lib/pre-enrollment";
import { sendPreEnrollmentOtpEmail } from "@/lib/brevo";

function normalizeIdentifier(value) {
  return value?.toString().trim() || "";
}

function looksLikeEmail(value) {
  return value.includes("@");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const identifier = normalizeIdentifier(body?.identifier);
    if (!identifier) {
      return NextResponse.json({ error: "Ingresa un correo o codigo valido." }, { status: 400 });
    }

    const service = getServiceSupabaseClient();
    let query = service.from("profiles").select("id, email, full_name, student_code, status");
    if (looksLikeEmail(identifier)) {
      query = query.eq("email", identifier.toLowerCase());
    } else {
      query = query.eq("student_code", identifier.toUpperCase());
    }

    let { data: profile, error } = await query.maybeSingle();
    if (error && String(error.message || "").toLowerCase().includes("status")) {
      const fallback = await service
        .from("profiles")
        .select("id, email, full_name, student_code")
        .eq(looksLikeEmail(identifier) ? "email" : "student_code", looksLikeEmail(identifier) ? identifier.toLowerCase() : identifier.toUpperCase())
        .maybeSingle();
      profile = fallback.data;
      error = fallback.error;
    }

    if (error) {
      throw new Error(error.message || "No se pudo validar el usuario.");
    }
    if (!profile?.id || !profile.email) {
      return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
    }

    const { code: otpCode } = await createEmailVerificationToken(profile.id);
    const origin =
      request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const loginUrl = `${origin}/login/access?code=${encodeURIComponent(profile.student_code || "")}&otp=1`;

    await sendPreEnrollmentOtpEmail({
      toEmail: profile.email,
      name: profile.full_name,
      code: profile.student_code || "",
      otpCode,
      expiresMinutes: 3,
      studentCode: profile.student_code || "",
      loginUrl,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PreEnrollment] request login otp error", error);
    return NextResponse.json({ error: error.message || "No se pudo enviar OTP." }, { status: 400 });
  }
}
