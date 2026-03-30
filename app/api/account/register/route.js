import { NextResponse } from "next/server";
import { createEmailVerificationToken, upsertPreEnrollmentProfile } from "@/lib/pre-enrollment";
import { sendPreEnrollmentOtpEmail } from "@/lib/brevo";
import { setPreEnrollSession } from "@/lib/pre-enroll-auth";
import { resolveCanonicalAppUrl } from "@/lib/security/env";

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, fullName, phone, phoneCountryCode, phoneNationalNumber, birthDate } = body || {};
    const origin = resolveCanonicalAppUrl();

    const { userId, studentCode } = await upsertPreEnrollmentProfile({
      email,
      fullName,
      phone,
      phoneCountryCode,
      phoneNationalNumber,
      birthDate,
    });
    const { code: otpCode } = await createEmailVerificationToken(userId);

    const loginUrl = `${origin}/login/access?code=${encodeURIComponent(studentCode)}&otp=1`;

    await sendPreEnrollmentOtpEmail({
      toEmail: email?.toString().trim().toLowerCase(),
      name: fullName,
      code: studentCode,
      expiresMinutes: 3,
      otpCode,
      studentCode,
      loginUrl,
    });

    await setPreEnrollSession(userId);

    return NextResponse.json({ ok: true, studentCode, loginUrl });
  } catch (error) {
    console.error("[PreEnrollment] register error", error);
    return NextResponse.json({ error: error.message || "No se pudo registrar." }, { status: 400 });
  }
}
