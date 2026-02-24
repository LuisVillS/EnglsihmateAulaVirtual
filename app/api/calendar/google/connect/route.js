import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  buildGoogleOAuthUrl,
  createGoogleOAuthState,
  hasGoogleCalendarOAuthConfig,
  resolveGoogleRedirectUri,
  resolveOriginFromHeaders,
} from "@/lib/google-calendar-oauth";

function asSafeReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return "/app/calendario";
  return raw;
}

export async function GET(request) {
  if (!hasGoogleCalendarOAuthConfig()) {
    return NextResponse.redirect(new URL("/app/calendario?google=oauth_not_configured", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const returnTo = asSafeReturnTo(searchParams.get("returnTo"));
  const state = createGoogleOAuthState({ userId: user.id, returnTo });
  if (!state) {
    return NextResponse.redirect(new URL("/app/calendario?google=state_error", request.url));
  }

  const headerStore = await headers();
  const origin = resolveOriginFromHeaders(headerStore);
  const redirectUri = resolveGoogleRedirectUri(origin);
  const authUrl = buildGoogleOAuthUrl({ state, redirectUri });
  return NextResponse.redirect(authUrl);
}
