import { randomBytes } from "node:crypto";
import { getServiceSupabaseClient, hasServiceRoleClient } from "./supabase-service";
import { ensureServiceAdminProfile } from "./admins";

export const DEFAULT_ADMIN_EMAIL = (process.env.DEFAULT_ADMIN_EMAIL || "luisvill99sa@gmail.com").toLowerCase();
let ensuredDefaultAdmin = false;

export async function findAuthUserByEmail(service, email) {
  try {
    const perPage = 200;
    let page = 1;
    while (true) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error("No se pudo listar usuarios para ubicar admin por defecto", error.message);
        return null;
      }
      const match = data?.users?.find((user) => user.email?.toLowerCase() === email);
      if (match) return match;
      if (!data?.users?.length || data.users.length < perPage) {
        return null;
      }
      page += 1;
    }
  } catch (error) {
    console.error("Fallo listando usuarios para admin por defecto", error);
    return null;
  }
}

export async function ensureDefaultAdminUser(force = false) {
  if ((ensuredDefaultAdmin && !force) || !hasServiceRoleClient() || !DEFAULT_ADMIN_EMAIL) {
    return;
  }

  if (!force) {
    ensuredDefaultAdmin = true;
  }
  try {
    const service = getServiceSupabaseClient();
    const { data: existingAdmin } = await service
      .from("admin_profiles")
      .select("id")
      .eq("email", DEFAULT_ADMIN_EMAIL)
      .maybeSingle();

    if (existingAdmin?.id) {
      return;
    }

    const authUser = await findAuthUserByEmail(service, DEFAULT_ADMIN_EMAIL);
    if (authUser?.id) {
      await ensureServiceAdminProfile({
        id: authUser.id,
        email: DEFAULT_ADMIN_EMAIL,
        fullName: authUser.user_metadata?.full_name || authUser.email,
        invited: true,
        passwordSet: Boolean(authUser.password_hash),
      });
      return;
    }

    const tempPassword = randomBytes(12).toString("base64url");
    const fallbackName = DEFAULT_ADMIN_EMAIL;
    const { data, error } = await service.auth.admin.createUser({
      email: DEFAULT_ADMIN_EMAIL,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        account_type: "admin",
        full_name: fallbackName,
      },
    });

    if (error || !data?.user?.id) {
      console.error("No se pudo crear el admin por defecto", error?.message);
      return;
    }

    await ensureServiceAdminProfile({
      id: data.user.id,
      email: DEFAULT_ADMIN_EMAIL,
      fullName: data.user.user_metadata?.full_name || DEFAULT_ADMIN_EMAIL,
      invited: true,
      passwordSet: false,
    });
  } catch (error) {
    console.error("Fallo al asegurar admin por defecto", error);
    if (!force) {
      ensuredDefaultAdmin = false;
    }
  }
}
