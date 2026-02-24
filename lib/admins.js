import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

function normalizeEmail(value) {
  return value?.toString().trim().toLowerCase() || "";
}

export async function selectAdminById(client, id, columns = "id, email, full_name, invited, password_set") {
  if (!client || !id) return null;
  const { data } = await client.from("admin_profiles").select(columns).eq("id", id).maybeSingle();
  return data || null;
}

export async function selectAdminByEmail(client, email, columns = "id, email, full_name, invited, password_set") {
  if (!client || !email) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { data } = await client.from("admin_profiles").select(columns).eq("email", normalized).maybeSingle();
  return data || null;
}

export async function isAdminUser(supabase, userId) {
  const record = await selectAdminById(supabase, userId, "id");
  return Boolean(record?.id);
}

export async function ensureServiceAdminProfile({ id, email, fullName, invited = true, passwordSet = false }) {
  if (!hasServiceRoleClient()) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para gestionar administradores.");
  }
  const client = getServiceSupabaseClient();
  const normalized = normalizeEmail(email);
  if (!id || !normalized) {
    throw new Error("El administrador requiere id y correo.");
  }

  await client
    .from("admin_profiles")
    .upsert(
      {
        id,
        email: normalized,
        full_name: fullName || null,
        invited,
        password_set: passwordSet,
      },
      { onConflict: "id" }
    );

  return { id, email: normalized };
}
