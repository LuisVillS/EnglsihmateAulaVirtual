import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request) {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
