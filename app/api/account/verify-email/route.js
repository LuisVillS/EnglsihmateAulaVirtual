import { NextResponse } from "next/server";
import { verifyEmailOtp } from "@/lib/pre-enrollment";
import { getPreEnrollSessionUserIdFromRequest } from "@/lib/pre-enroll-auth";

export async function POST(request) {
  try {
    const userId = getPreEnrollSessionUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const body = await request.json();
    const { code } = body || {};
    await verifyEmailOtp({ userId, code });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PreEnrollment] verify error", error);
    return NextResponse.json({ error: error.message || "No se pudo verificar." }, { status: 400 });
  }
}
