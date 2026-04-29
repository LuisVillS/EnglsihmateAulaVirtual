"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { authInitialState } from "@/lib/auth-state";
import { DEFAULT_ADMIN_EMAIL, ensureDefaultAdminUser, findAuthUserByEmail } from "@/lib/default-admin";
import { requestPasswordRecovery, verifyRecoveryCodeAndResetPassword } from "@/lib/password-recovery";
import { verifyEmailOtp } from "@/lib/pre-enrollment";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";
import { fetchCrmAccessProfileByEmail, resolveAdminLandingPath } from "@/lib/crm/auth";
import {
  ADMIN_LOGIN_LOCK_MESSAGE,
  GENERIC_AUTH_ERROR_MESSAGE,
  clearAdminLoginFailures,
  getAdminLoginLockState,
  recordFailedAdminLogin,
  resolveRequestIp,
} from "@/lib/auth-security";
import { resolveCanonicalAppUrl } from "@/lib/security/env";

const GENERIC_LOOKUP_ERROR = GENERIC_AUTH_ERROR_MESSAGE;

ensureDefaultAdminUser();

function looksLikeEmail(value) {
  return Boolean(value && value.includes("@"));
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
  const normalizedEmail = normalizeEmail(identifier);
  if (!normalizedEmail) return null;

  const accessProfile = await fetchCrmAccessProfileByEmail(normalizedEmail);
  if (!accessProfile?.isClassicAdmin && !accessProfile?.isCrmRole) return null;

  return {
    id: accessProfile.userId,
    email: accessProfile.email,
    full_name:
      accessProfile.adminProfile?.full_name ||
      accessProfile.crmOperatorProfile?.full_name ||
      accessProfile.crmUserRole?.email ||
      "",
    invited: accessProfile.isClassicAdmin ? Boolean(accessProfile.adminProfile?.invited) : true,
    password_set: accessProfile.isClassicAdmin ? Boolean(accessProfile.adminProfile?.password_set) : true,
    role: accessProfile.isClassicAdmin ? USER_ROLES.ADMIN : accessProfile.crmRole,
    crmRole: accessProfile.crmRole,
    isClassicAdmin: Boolean(accessProfile.isClassicAdmin),
    isCrmRole: Boolean(accessProfile.isCrmRole),
    isCrmAdmin: Boolean(accessProfile.isCrmAdmin),
    isCrmOperator: Boolean(accessProfile.isCrmOperator),
    landingPath: accessProfile.landingPath,
  };
}

async function redirectByRole(supabase, user) {
  const resolvedUser = user || null;

  if (!resolvedUser) {
    redirect("/");
  }

  const landingPath = await resolveAdminLandingPath(supabase, resolvedUser.id);
  if (landingPath) {
    redirect(landingPath);
  }

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", resolvedUser.id)
    .maybeSingle();
  if (profileError && String(profileError.message || "").toLowerCase().includes("status")) {
    const fallback = await supabase.from("profiles").select("id, role").eq("id", resolvedUser.id).maybeSingle();
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
      error: GENERIC_LOOKUP_ERROR,
    };
  }

  const identifier = normalizeIdentifier(formData.get("email"));
  const otp = normalizeIdentifier(formData.get("otp"));

  if (!identifier) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: GENERIC_LOOKUP_ERROR,
    };
  }

  let profile = null;
  if (context === "admin") {
    if (!looksLikeEmail(identifier)) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        error: GENERIC_LOOKUP_ERROR,
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
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: GENERIC_LOOKUP_ERROR,
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
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: GENERIC_LOOKUP_ERROR,
    };
  }

  const profileEmail = profile.email?.toLowerCase();
  const normalizedStatus = profile.status || "enrolled";
  const needsPasswordSetup =
    context === "student" && normalizedStatus === "pre_registered" && !profile.password_set;
  const requiresOtp = needsPasswordSetup && requireOtp;

  if (requiresOtp) {
    if (!otp) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        email: identifier,
        identifier,
        step: "email",
        error: "Ingresa el Codigo de Acceso enviado a tu correo para continuar.",
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
        error: error?.message || "Codigo de Acceso invalido o expirado.",
      };
    }
  }

  if (needsPasswordSetup) {
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
  const loginState = {
    ...prevState,
    context,
    requireOtp,
    step: "login",
  };

  if (!email) {
    return {
      ...withContext(authInitialState, context, requireOtp),
      error: GENERIC_AUTH_ERROR_MESSAGE,
    };
  }

  if (!password) {
    return {
      ...loginState,
      error: GENERIC_AUTH_ERROR_MESSAGE,
    };
  }

  const headerStore = await headers();
  const requestIp = resolveRequestIp(headerStore);
  const service = hasServiceRoleClient() ? getServiceSupabaseClient() : null;
  let adminProfile = null;

  if (context === "admin") {
    if (!service) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        error: GENERIC_AUTH_ERROR_MESSAGE,
      };
    }

    adminProfile = await fetchAdminProfileByEmail(email);
    if (!adminProfile?.id) {
      return {
        ...withContext(authInitialState, context, requireOtp),
        error: GENERIC_AUTH_ERROR_MESSAGE,
      };
    }

    const lockState = await getAdminLoginLockState({ email, service });
    if (lockState.locked) {
      return {
        ...loginState,
        error: ADMIN_LOGIN_LOCK_MESSAGE,
      };
    }
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (context === "admin" && adminProfile?.id && service) {
      const failureState = await recordFailedAdminLogin({
        email,
        ipAddress: requestIp,
        service,
      });
      if (failureState.locked) {
        return {
          ...loginState,
          error: ADMIN_LOGIN_LOCK_MESSAGE,
        };
      }
    }

    return {
      ...loginState,
      error: GENERIC_AUTH_ERROR_MESSAGE,
    };
  }

  if (context === "admin" && adminProfile?.id && service) {
    await clearAdminLoginFailures({ email, service });
  }

  await redirectByRole(supabase, user);
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
  const {
    data: { user },
    error: signInError,
  } = await supabase.auth.signInWithPassword({ email, password });

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

  await redirectByRole(supabase, user);
}

async function handleGoogleLogin(prevState, context, requireOtp) {
  if (context === "admin") {
    return {
      ...prevState,
      context,
      requireOtp,
      error: "Google no esta habilitado para el acceso administrativo.",
    };
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  let canonicalAppUrl = "";
  try {
    canonicalAppUrl = resolveCanonicalAppUrl();
  } catch (error) {
    return {
      ...prevState,
      context,
      requireOtp,
      error: error?.message || "No se pudo iniciar sesion con Google.",
    };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${canonicalAppUrl}/auth/callback`,
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
