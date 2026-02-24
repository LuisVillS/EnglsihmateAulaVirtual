import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { formatBillingMonth, getCurrentBillingMonthDate } from "@/lib/payments";

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const billingMonth = String(body?.billingMonth || formatBillingMonth(getCurrentBillingMonthDate(new Date())));

    const service = getServiceSupabaseClient();
    const nowIso = new Date().toISOString();
    const payload = {
      approved_screen_seen: true,
      approved_screen_seen_at: nowIso,
    };

    let updateResult = await service
      .from("payments")
      .update(payload)
      .eq("student_id", user.id)
      .eq("billing_month", billingMonth)
      .eq("status", "approved")
      .eq("approved_screen_seen", false);

    const message = String(updateResult.error?.message || "");
    const missingSeenColumn =
      message.includes("approved_screen_seen") || message.includes("approved_screen_seen_at");

    if (missingSeenColumn) {
      updateResult = await service
        .from("payments")
        .update({ approved_at: nowIso })
        .eq("student_id", user.id)
        .eq("billing_month", billingMonth)
        .eq("status", "approved");
    }

    if (updateResult.error) {
      throw new Error(updateResult.error.message || "No se pudo confirmar el estado.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Payments] mark approval seen error", error);
    return NextResponse.json({ error: error.message || "No se pudo confirmar el estado." }, { status: 400 });
  }
}
