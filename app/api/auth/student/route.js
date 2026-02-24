import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/duolingo/api-auth";
import { resolveStudentIdentity } from "@/lib/duolingo/student-upsert";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { supabase, db } = await getDbClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const profile = await resolveStudentIdentity({
      userId: user?.id || null,
      studentCode: body?.student_code || body?.studentCode,
      idDocument: body?.id_document || body?.idDocument,
      fullName: body?.full_name || body?.fullName,
      email: body?.email,
      serviceClient: db,
    });

    if (!profile?.id) {
      return NextResponse.json(
        { error: "No se pudo autenticar por student_code. Verifica los datos." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      student: {
        id: profile.id,
        student_code: profile.student_code,
        id_document: profile.id_document || profile.dni || null,
        full_name: profile.full_name,
        email: profile.email,
        xp_total: Number(profile.xp_total || 0) || 0,
        current_streak: Number(profile.current_streak || 0) || 0,
      },
      source: user?.id ? "session-or-code" : "student_code",
    });
  } catch (error) {
    console.error("POST /api/auth/student failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo autenticar estudiante." },
      { status: 500 }
    );
  }
}

