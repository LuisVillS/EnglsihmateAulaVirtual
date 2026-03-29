import { createClient } from "@supabase/supabase-js";
import { createSupabaseTraceFetch } from "./supabase-tracing.js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let serviceClient;

export function hasServiceRoleClient() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

export function getServiceSupabaseClient() {
  if (!hasServiceRoleClient()) {
    throw new Error("Supabase service role env vars are missing. Define SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (serviceClient) return serviceClient;
  serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: createSupabaseTraceFetch(fetch),
    },
  });
  return serviceClient;
}
