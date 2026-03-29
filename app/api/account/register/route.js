import { NextResponse } from "next/server";
import { createEmailVerificationToken, upsertPreEnrollmentProfile } from "@/lib/pre-enrollment";
import { sendPreEnrollmentOtpEmail } from "@/lib/brevo";
import { setPreEnrollSession } from "@/lib/pre-enroll-auth";
import { submitCrmWebFormLead } from "@/lib/crm/integrations/web-form-ingestion";
import { resolveCanonicalAppUrl } from "@/lib/security/env";

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, fullName, phone, phoneCountryCode, phoneNationalNumber, birthDate } = body || {};
    const origin = resolveCanonicalAppUrl();
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      new URL(origin).host;

    await submitCrmWebFormLead({
      payload: {
        fullName,
        email,
        phone,
        siteKey:
          body?.siteKey ||
          (String(host || "").toLowerCase() === "virtual.englishmate.com.pe" ? "virtual_site" : "main_site"),
        formKey: body?.formKey || "pre_enrollment_register",
        formLabel: body?.formLabel || "Pre-enrollment Register",
        pagePath: body?.pagePath || "/account/register",
        landingUrl: body?.landingUrl || `${origin.replace(/\/$/, "")}/account/register`,
        referrerUrl: body?.referrerUrl || null,
        utmSource: body?.utmSource || null,
        utmMedium: body?.utmMedium || null,
        utmCampaign: body?.utmCampaign || null,
        utmTerm: body?.utmTerm || null,
        utmContent: body?.utmContent || null,
        turnstileToken: body?.turnstileToken,
        host: normalizeFreeText(host),
      },
      headers: request.headers,
    });

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
