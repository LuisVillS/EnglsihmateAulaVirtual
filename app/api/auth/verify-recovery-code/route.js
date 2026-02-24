"use server";

import { NextResponse } from "next/server";
import { verifyRecoveryCodeAndResetPassword } from "@/lib/password-recovery";

export async function POST(request) {
  try {
    const { email, code, newPassword } = await request.json();
    await verifyRecoveryCodeAndResetPassword({ email, code, newPassword });
    return NextResponse.json({
      success: true,
      message: "Contrasena actualizada correctamente.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Codigo invalido o expirado.",
      },
      { status: 400 }
    );
  }
}
