"use server";

import { NextResponse } from "next/server";
import { requestPasswordRecovery } from "@/lib/password-recovery";

export async function POST(request) {
  try {
    const { email } = await request.json();
    await requestPasswordRecovery(email);
    return NextResponse.json({
      success: true,
      message: "Te enviamos un codigo a tu correo.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "No se pudo procesar la solicitud.",
      },
      { status: 400 }
    );
  }
}
