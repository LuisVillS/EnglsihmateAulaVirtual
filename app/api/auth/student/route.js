import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/duolingo/api-auth";
import { ensureGamificationProfile } from "@/lib/gamification/profile";
import { resolveStudentIdentity } from "@/lib/duolingo/student-upsert";

export async function POST() {
  try {
    const { supabase, db } = await getDbClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const profile = await resolveStudentIdentity({
      userId: user.id,
      userEmail: user.email || null,
      serviceClient: db,
    });

    if (!profile?.id) {
      return NextResponse.json({ error: "No se pudo resolver el alumno." }, { status: 404 });
    }

    const gamification = await ensureGamificationProfile(db, {
      userId: profile.id,
      legacyXpTotal: profile.xp_total,
    });

    return NextResponse.json({
      student: {
        id: profile.id,
        student_code: profile.student_code,
        id_document: profile.id_document || profile.dni || null,
        full_name: profile.full_name,
        email: profile.email,
        xp_total: gamification.lifetimeXp,
        current_streak: Number(profile.current_streak || 0) || 0,
      },
      gamification,
      source: "session",
    });
  } catch (error) {
    console.error("POST /api/auth/student failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo autenticar estudiante." },
      { status: 500 }
    );
  }
}
