import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        if (!allowCookieSetter) {
          return;
        }
        try {
          cookieStore.set(name, value, options);
        } catch (error) {
          if (!canIgnoreCookieMutationError(error)) {
            throw error;
          }
        }
      },
      remove(name, options) {
        if (!allowCookieSetter) {
          return;
        }
        try {
          cookieStore.delete(name);
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

