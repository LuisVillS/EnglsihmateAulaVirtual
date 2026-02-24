import { NextResponse } from "next/server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

export async function POST() {
  try {
    if (!hasServiceRoleClient()) {
      return NextResponse.json({ error: "Configura SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }

    const service = getServiceSupabaseClient();
    const now = new Date();

    await service
      .from("email_verification_tokens")
      .delete()
      .lt("expires_at", now.toISOString());

    await service
      .from("pre_enrollments")
      .update({
        status: "EXPIRED",
        reservation_expires_at: null,
        updated_at: now.toISOString(),
      })
      .eq("status", "RESERVED")
      .lt("reservation_expires_at", now.toISOString());

    const abandonedThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await service
      .from("pre_enrollments")
      .update({ status: "ABANDONED", updated_at: now.toISOString() })
      .in("status", ["EMAIL_VERIFIED", "IN_PROGRESS"])
      .lt("updated_at", abandonedThreshold);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Cleanup] pre-enrollment", error);
    return NextResponse.json({ error: "No se pudo limpiar." }, { status: 500 });
  }
}
