"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { authInitialState } from "@/lib/auth-state";
import { DEFAULT_ADMIN_EMAIL, ensureDefaultAdminUser, findAuthUserByEmail } from "@/lib/default-admin";
import { requestPasswordRecovery, verifyRecoveryCodeAndResetPassword } from "@/lib/password-recovery";
import { selectAdminByEmail, selectAdminById } from "@/lib/admins";
import { verifyEmailOtp } from "@/lib/pre-enrollment";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

const NOT_REGISTERED_MESSAGE = "Este correo no se encuentra registrado en el aula virtual.";
const ADMIN_ONLY_MESSAGE = "Este acceso es solo para administradores.";
const ADMIN_USE_ADMIN_LOGIN = "Usa el acceso admin en /admin.";

ensureDefaultAdminUser();

function looksLikeEmail(value) {
  return value.includes("@");
}

async function fetchStudentProfileByIdentifier(identifier) {
  if (!hasServiceRoleClient()) return null;
  const trimmed = identifier?.trim();
  if (!trimmed) return null;

  const service = getServiceSupabaseClient();
  const baseColumns = "id, full_name, password_set, invited, role, email, student_code, status";
  const legacyColumns = "id, full_name, password_set, invited, role, email, student_code";
  const fetchOne = async (buildQuery) => {
    let result = await buildQuery(baseColumns);
    if (result.error && String(result.error.message || "").toLowerCase().includes("status")) {
      result = await buildQuery(legacyColumns);
    }
    if (result.error) return null;
    const rows = result.data;
    return Array.isArray(rows) ? rows[0] : rows || null;
  };

  let profile = null;
  const isEmail = looksLikeEmail(trimmed.toLowerCase());

  if (isEmail) {
    const normalizedEmail = trimmed.toLowerCase();
    profile = await fetchOne((columns) =>
      service.from("profiles").select(columns).eq("email", normalizedEmail).limit(1)
    );

    if (!profile) {
      profile = await fetchOne((columns) =>
        service.from("profiles").select(columns).ilike("email", normalizedEmail).limit(1)
      );
    }

    if (!profile) {
      const authUser = await findAuthUserByEmail(service, normalizedEmail);
      if (authUser?.id) {
        const role =
          authUser.email?.toLowerCase() === DEFAULT_ADMIN_EMAIL ? USER_ROLES.ADMIN : USER_ROLES.NON_STUDENT;
        const { data: upsertedRows } = await service
          .from("profiles")
          .upsert(
            {
              id: authUser.id,
              email: authUser.email?.toLowerCase() || normalizedEmail,
              role,
              invited: true,
              full_name: authUser.user_metadata?.full_name || null,
              password_set: false,
              status: "pre_registered",
            },
            { onConflict: "id" }
          )
          .select("id, full_name, password_set, invited, role, email, student_code, status")
          .limit(1);
        profile = Array.isArray(upsertedRows) ? upsertedRows[0] : upsertedRows || null;
      }
    }
  } else {
    const code = trimmed.toUpperCase();
    profile = await fetchOne((columns) =>
      service.from("profiles").select(columns).eq("student_code", code).limit(1)
    );
  }

  return profile;
}

async function fetchAdminProfileByEmail(identifier) {
  if (!hasServiceRoleClient()) return null;
  const normalizedEmail = normalizeEmail(identifier);
  if (!normalizedEmail) return null;
  const service = getServiceSupabaseClient();
  const adminProfile = await selectAdminByEmail(service, normalizedEmail);
  return adminProfile ? { ...adminProfile, role: "admin" } : null;
}

async function redirectByRole(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const adminRecord = await selectAdminById(supabase, user.id, "id");
  if (adminRecord?.id) {
    redirect("/admin");
  }

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError && String(profileError.message || "").toLowerCase().includes("status")) {
    const fallback = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
    profile = fallback.data;
    profileError = fallback.error;
  }

  const effectiveRole = resolveProfileRole({ role: profile?.role, status: profile?.status });
  if (!profileError && effectiveRole === USER_ROLES.ADMIN) {
    redirect("/admin");
  }
  if (!profileError && effectiveRole === USER_ROLES.NON_STUDENT) {
    redirect("/app/matricula");
  }

  redirect("/app");
}

function normalizeIdentifier(value) {
  return value?.toString().trim() || "";
}

function normalizeEmail(value) {
  const normalized = value?.toString().trim().toLowerCase() || "";
  return normalized.includes("@") ? normalized : "";
}

function parseBooleanFlag(value) {
  const normalized = value?.toString().trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function withContext(base, context, requireOtp = false) {
  return { ...base, context, requireOtp };
}

export async function privateAuthAction(prevState, formData) {
  const intent = formData.get("intent")?.toString();
  const context = formData.get("context")?.toString() || prevState?.context || "student";
  const requireOtp = parseBooleanFlag(formData.get("requireOtp")) || Boolean(prevState?.requireOtp);

  switch (intent) {
    case "lookup":
      return handleLookup(formData, context, requireOtp);
    case "login":
      return handlePasswordLogin(prevState, formData, context, requireOtp);
    case "set_password":
      return handleSetPassword(prevState, formData, context, requireOtp);
    case "google":
      return handleGoogleLogin(prevState, context, requireOtp);
    case "reset_request":
      return handleResetRequest(formData, context, requireOtp);
    case "reset_verify":
      return handleResetVerification(prevState, formData, context, requireOtp);
    case "reset":
      return withContext({ ...authInitialState }, context, requireOtp);
    default:
      return withContext({ ...authInitialState }, context, requireOtp);
  }
}

async function handleLookup(formData, context, requireOtp) {
  if (!hasServiceRoleClient()) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: "Configura SUPABASE_SERVICE_ROLE_KEY para validar correos.",
    };
  }

  const identifier = normalizeIdentifier(formData.get("email"));
  const otp = normalizeIdentifier(formData.get("otp"));

  if (!identifier) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: "Ingresa un correo o codigo valido.",
    };
  }

  let profile = null;
  if (context === "admin") {
    if (!looksLikeEmail(identifier)) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        error: "Usa un correo admin autorizado.",
      };
    }
    profile = await fetchAdminProfileByEmail(identifier);
  } else {
    profile = await fetchStudentProfileByIdentifier(identifier);
  }

  if (
    !profile &&
    looksLikeEmail(identifier) &&
    identifier.toLowerCase() === DEFAULT_ADMIN_EMAIL &&
    context === "admin"
  ) {
    await ensureDefaultAdminUser(true);
    profile = await fetchAdminProfileByEmail(DEFAULT_ADMIN_EMAIL);
  }

  if (!profile?.id) {
    if (
      context === "student" &&
      looksLikeEmail(identifier) &&
      (await fetchAdminProfileByEmail(identifier))
    ) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        error: ADMIN_USE_ADMIN_LOGIN,
      };
    }
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: NOT_REGISTERED_MESSAGE,
    };
  }

  if (!profile.invited && profile.role !== "admin") {
    if (profile.status === "pre_registered") {
      const service = getServiceSupabaseClient();
      await service.from("profiles").update({ invited: true }).eq("id", profile.id);
      profile.invited = true;
    }
  }

  if (!profile.invited) {
    if (
      context === "student" &&
      looksLikeEmail(identifier) &&
      (await fetchAdminProfileByEmail(identifier))
    ) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        error: ADMIN_USE_ADMIN_LOGIN,
      };
    }
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: NOT_REGISTERED_MESSAGE,
    };
  }

  if (context === "admin" && profile.role !== "admin") {
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: ADMIN_ONLY_MESSAGE,
    };
  }

  if (context === "student" && profile.role === "admin") {
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: ADMIN_USE_ADMIN_LOGIN,
    };
  }

  const profileEmail = profile.email?.toLowerCase();
  const normalizedStatus = profile.status || "enrolled";
  const requiresOtp = context === "student" && requireOtp && !profile.password_set;

  if (requiresOtp) {
    if (!otp) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        email: identifier,
        identifier,
        step: "email",
        error: "Ingresa el OTP enviado a tu correo para continuar.",
      };
    }

    try {
      await verifyEmailOtp({ userId: profile.id, code: otp });
    } catch (error) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        email: identifier,
        identifier,
        step: "email",
        error: error?.message || "OTP invalido o expirado.",
      };
    }
  }

  if (!profile.password_set && context === "student") {
    return {
      context,
      requireOtp,
      step: "set_password",
      email: profileEmail,
      identifier,
      profileId: profile.id,
      fullName: profile.full_name || "",
      status: normalizedStatus,
      message: "Es tu primer acceso. Crea una contrasena para continuar.",
      error: null,
    };
  }

  const loginMessage = !profile.password_set
    ? "Usa la contrasena temporal que te enviamos por correo y luego actualizala en tu perfil."
    : profile.full_name
        ? `Hola ${profile.full_name}, ingresa tu contrasena.`
        : "Ingresa tu contrasena para continuar.";

  return {
    context,
    requireOtp,
    step: "login",
    email: profileEmail,
    identifier,
    profileId: profile.id,
    fullName: profile.full_name || "",
    status: normalizedStatus,
    message: loginMessage,
    error: null,
  };
}

async function handlePasswordLogin(prevState, formData, context, requireOtp) {
  const email = normalizeEmail(formData.get("email")) || prevState.email;
  const password = formData.get("password")?.toString() || "";

  if (!email) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: "Primero valida tu correo.",
    };
  }

  if (!password) {
    return {
      ...prevState,
      context,
      requireOtp,
      step: "login",
      error: "Ingresa tu contrasena.",
    };
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      ...prevState,
      context,
      step: "login",
      error: "Contrasena incorrecta o caducada.",
    };
  }

  await redirectByRole(supabase);
}

async function handleSetPassword(prevState, formData, context, requireOtp) {
  const email = normalizeEmail(formData.get("email")) || prevState.email;
  const profileId = prevState.profileId;
  const password = formData.get("newPassword")?.toString() || "";
  const confirm = formData.get("confirmPassword")?.toString() || "";

  if (!email || !profileId) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: "Primero valida tu correo o codigo.",
    };
  }

  if (password.length < 6) {
    return {
      ...prevState,
      context,
      requireOtp,
      step: "set_password",
      error: "La contrasena debe tener al menos 6 caracteres.",
    };
  }

  if (password !== confirm) {
    return {
      ...prevState,
      context,
      requireOtp,
      step: "set_password",
      error: "Las contrasenas no coinciden.",
    };
  }

  if (!hasServiceRoleClient()) {
    return {
      ...prevState,
      context,
      requireOtp,
      step: "set_password",
      error: "Configura SUPABASE_SERVICE_ROLE_KEY para crear contrasenas.",
    };
  }

  const service = getServiceSupabaseClient();
  const { error: updateError } = await service.auth.admin.updateUserById(profileId, {
    password,
    email_confirm: true,
  });

  if (updateError) {
    return {
      ...prevState,
      context,
      requireOtp,
      step: "set_password",
      error: updateError.message || "No se pudo crear la contrasena.",
    };
  }

  await service.from("profiles").update({ password_set: true, invited: true }).eq("id", profileId);

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    return {
      ...prevState,
      context,
      requireOtp,
      step: "login",
      message: "Contrasena creada. Inicia sesion para continuar.",
      error: null,
    };
  }

  await redirectByRole(supabase);
}

async function handleGoogleLogin(prevState, context, requireOtp) {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const headerStore = await headers();
  const origin = headerStore.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data?.url) {
    return {
      ...prevState,
      context,
      requireOtp,
      error: error?.message || "No se pudo iniciar sesion con Google.",
    };
  }

  redirect(data.url);
}

async function handleResetRequest(formData, context, requireOtp) {
  const email = normalizeEmail(formData.get("email"));
  if (!email) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      step: "reset_request",
      error: "Ingresa un correo.",
    };
  }

  try {
    await requestPasswordRecovery(email);
  } catch (error) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      step: "reset_request",
      error: error.message || "No pudimos enviar el codigo. Intenta mas tarde.",
    };
  }

  return {
    context,
    requireOtp,
    step: "reset_code",
    email,
    resetEmail: email,
    fullName: "",
    message: "Te enviamos un codigo de 6 digitos. Revisa tu correo.",
    error: null,
  };
}

async function handleResetVerification(prevState, formData, context, requireOtp) {
  const email = normalizeEmail(formData.get("email")) || prevState.resetEmail || prevState.email;
  const code = formData.get("resetCode")?.toString().trim();
  const password = formData.get("newPassword")?.toString() || "";
  const confirm = formData.get("confirmPassword")?.toString() || "";

  if (!email) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      step: "reset_request",
      error: "Ingresa tu correo.",
    };
  }

  if (!code || code.length < 4) {
    return {
      ...prevState,
      context,
      step: "reset_code",
      error: "Ingresa el codigo recibido.",
    };
  }

  if (password.length < 6) {
    return {
      ...prevState,
      context,
      step: "reset_code",
      error: "La nueva contrasena debe tener al menos 6 caracteres.",
    };
  }

  if (password !== confirm) {
    return {
      ...prevState,
      context,
      step: "reset_code",
      error: "Las contrasenas no coinciden.",
    };
  }

  try {
    await verifyRecoveryCodeAndResetPassword({ email, code, newPassword: password });
  } catch (error) {
    return {
      ...prevState,
      context,
      step: "reset_code",
      error: error.message || "Codigo invalido o vencido.",
    };
  }

  return {
    ...withContext(authInitialState, context, requireOtp),
    step: "email",
    message: "Contrasena actualizada. Inicia sesion con la nueva clave.",
  };
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  await supabase.auth.signOut();
  redirect("/");
}
