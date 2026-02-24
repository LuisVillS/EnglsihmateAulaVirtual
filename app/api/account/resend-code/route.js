import { NextResponse } from "next/server";
import { sendPreEnrollmentOtpEmail } from "@/lib/brevo";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { createEmailVerificationToken } from "@/lib/pre-enrollment";

export async function POST(request) {
  try {
    const userId = await resolvePreEnrollmentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const service = getServiceSupabaseClient();
    const { data: profile } = await service
      .from("profiles")
      .select("email, full_name, student_code")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.email) {
      return NextResponse.json({ error: "Cuenta invalida." }, { status: 400 });
    }

    const origin =
      request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const studentCode = profile.student_code || "";
    const loginUrl = `${origin}/login/access?code=${encodeURIComponent(studentCode)}&otp=1`;
    const { code: otpCode } = await createEmailVerificationToken(userId);

    await sendPreEnrollmentOtpEmail({
      toEmail: profile.email,
      name: profile.full_name,
      code: studentCode,
      expiresMinutes: 3,
      otpCode,
      studentCode,
      loginUrl,
    });

    return NextResponse.json({ ok: true, studentCode, loginUrl });
  } catch (error) {
    console.error("[PreEnrollment] resend error", error);
    return NextResponse.json({ error: error.message || "No se pudo reenviar." }, { status: 400 });
  }
}
