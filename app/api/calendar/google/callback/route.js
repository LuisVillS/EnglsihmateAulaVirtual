import { NextResponse } from "next/server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import {
  computeTokenExpiry,
  exchangeGoogleCode,
  fetchGoogleUserProfile,
  hasGoogleCalendarOAuthConfig,
  resolveGoogleRedirectUri,
  resolveCanonicalAppOrigin,
  verifyGoogleOAuthState,
} from "@/lib/google-calendar-oauth";

function withQuery(path, key, value) {
  const safePath = String(path || "/app/calendario");
  const separator = safePath.includes("?") ? "&" : "?";
  return `${safePath}${separator}${encodeURIComponent(key)}=${encodeURIComponent(String(value || ""))}`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const stateCheck = verifyGoogleOAuthState(state);
  const returnTo = stateCheck.valid ? stateCheck.returnTo : "/app/calendario";

  if (oauthError) {
    return NextResponse.redirect(new URL(withQuery(returnTo, "google", oauthError), request.url));
  }

  if (!stateCheck.valid || !code) {
    return NextResponse.redirect(new URL(withQuery(returnTo, "google", "state_invalid"), request.url));
  }

  if (!hasGoogleCalendarOAuthConfig()) {
    return NextResponse.redirect(new URL(withQuery(returnTo, "google", "oauth_not_configured"), request.url));
  }
  if (!hasServiceRoleClient()) {
    return NextResponse.redirect(new URL(withQuery(returnTo, "google", "service_role_missing"), request.url));
  }

  try {
    const origin = resolveCanonicalAppOrigin();
    const redirectUri = resolveGoogleRedirectUri(origin);
    const tokenResult = await exchangeGoogleCode({ code, redirectUri });
    const service = getServiceSupabaseClient();

    const { data: currentConnection } = await service
      .from("google_calendar_connections")
      .select("user_id, refresh_token")
      .eq("user_id", stateCheck.userId)
      .maybeSingle();

    const refreshToken = tokenResult.refresh_token || currentConnection?.refresh_token || null;
    if (!refreshToken) {
      return NextResponse.redirect(new URL(withQuery(returnTo, "google", "refresh_token_missing"), request.url));
    }

    const userInfo = await fetchGoogleUserProfile(tokenResult.access_token);
    const { error: upsertError } = await service.from("google_calendar_connections").upsert(
      {
        user_id: stateCheck.userId,
        provider: "google",
        calendar_id: "primary",
        google_user_email: userInfo?.email || null,
        access_token: tokenResult.access_token,
        refresh_token: refreshToken,
        token_type: tokenResult.token_type || "Bearer",
        scope: tokenResult.scope || null,
        expires_at: computeTokenExpiry(tokenResult.expires_in),
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sync_error: null,
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      return NextResponse.redirect(new URL(withQuery(returnTo, "google", "save_failed"), request.url));
    }
    return NextResponse.redirect(new URL(withQuery(returnTo, "google", "connected"), request.url));
  } catch (error) {
    const rawMessage = String(error?.message || "callback_failed");
    return NextResponse.redirect(new URL(withQuery(returnTo, "google", rawMessage), request.url));
  }
}
