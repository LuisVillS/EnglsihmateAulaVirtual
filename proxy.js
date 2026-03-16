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

function buildRequestHeaders(request, { isFlipbookRoute = false } = {}) {
  const requestHeaders = new Headers(request.headers);
  if (isFlipbookRoute) {
    requestHeaders.set("x-library-flipbook-route", "1");
  } else {
    requestHeaders.delete("x-library-flipbook-route");
  }
  return requestHeaders;
}

async function updateSession(request, requestHeaders = request.headers) {
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
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
          request: {
            headers: requestHeaders,
          },
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
  const isFlipbookRoute = request.nextUrl.pathname.startsWith("/app/library/flipbook/");
  const requestHeaders = buildRequestHeaders(request, { isFlipbookRoute });

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  if (shouldBypassProxy(request) || !hasSupabaseAuthCookie(request)) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return updateSession(request, requestHeaders);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
