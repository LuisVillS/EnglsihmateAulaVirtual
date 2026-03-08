import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/duolingo/api-auth";
import { recheckLibrarySourceRecord } from "@/lib/library/admin";

export async function POST(request, { params: paramsPromise }) {
  const auth = await requireAdminRouteAccess();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const params = await paramsPromise;
    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const scope = String(body?.scope || searchParams.get("scope") || "book").trim().toLowerCase();
    const record = await recheckLibrarySourceRecord({
      db: auth.db,
      id: params?.id,
      scope: scope === "staging" ? "staging" : "book",
    });

    return NextResponse.json({
      record,
      scope: scope === "staging" ? "staging" : "book",
    });
  } catch (error) {
    console.error("POST /api/admin/library/recheck/[id] failed", error);
    return NextResponse.json(
      { error: error?.message || "No se pudo revalidar el registro." },
      { status: 500 }
    );
  }
}

