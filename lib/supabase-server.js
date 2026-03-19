import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseTraceFetch } from "@/lib/supabase-tracing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase environment variables are not configured.");
}

function canIgnoreCookieMutationError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("cookies can only be modified in a server action or route handler");
}

export async function createSupabaseServerClient({ allowCookieSetter = false } = {}) {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: createSupabaseTraceFetch(fetch),
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (!allowCookieSetter) {
          return;
        }
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          if (!canIgnoreCookieMutationError(error)) {
            throw error;
          }
        }
      },
    },
  });
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}
