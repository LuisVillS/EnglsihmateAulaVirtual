import { NextResponse } from "next/server";
import { requireLibraryStudentRouteAccess } from "@/lib/library/auth";
import { loadStudentLibraryHome, loadStudentLibraryProfile } from "@/lib/library/repository";

export async function GET() {
  const auth = await requireLibraryStudentRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const profile =
      auth.profile?.id
        ? {
            id: auth.profile.id,
            fullName: auth.profile.full_name || "",
            courseLevel: auth.profile.course_level || "",
            cefrLevel: "",
          }
        : await loadStudentLibraryProfile({
            db: auth.db,
            userId: auth.user.id,
          });

    const home = await loadStudentLibraryHome({
      db: auth.db,
      userId: auth.user.id,
      profileLevel: profile?.courseLevel || profile?.cefrLevel || "",
    });

    return NextResponse.json(home);
  } catch (error) {
    console.error("GET /api/library/home failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar la biblioteca personalizada." },
      { status: 500 }
    );
  }
}
