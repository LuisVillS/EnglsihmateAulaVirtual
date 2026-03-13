import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function hasSupabaseAuthCookie(request) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie?.name?.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

function shouldBypassProxy(request) {
  const { pathname } = request.nextUrl;
  if (request.method !== "GET") return true;
  if (pathname.startsWith("/api/")) return true;
  if (request.headers.get("next-router-prefetch")) return true;
  if (request.headers.get("purpose") === "prefetch") return true;

  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return true;

  return false;
}

function withPublicFlipbookHeader(request) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-public-flipbook", "1");
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

async function updateSession(request) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch (error) {
    if (error?.status !== 429 && error?.code !== "over_request_rate_limit") {
      throw error;
    }
  }

  return response;
}

export async function proxy(request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({
      request,
    });
  }

  if (request.nextUrl.pathname.startsWith("/app/library/flipbook/")) {
    return withPublicFlipbookHeader(request);
  }

  if (shouldBypassProxy(request) || !hasSupabaseAuthCookie(request)) {
    return NextResponse.next({
      request,
    });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
