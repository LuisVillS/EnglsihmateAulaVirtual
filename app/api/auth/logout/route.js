import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function signOutAndRedirect(request) {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  await supabase.auth.signOut();
  const url = new URL("/", request.url);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  return signOutAndRedirect(request);
}

export async function POST(request) {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
