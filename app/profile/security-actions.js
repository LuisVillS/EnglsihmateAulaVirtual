"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth-monitor";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const profileActionInitialState = { status: null, message: null };

function formatError(message) {
  return { status: "error", message };
}

function formatSuccess(message) {
  return { status: "success", message };
}

function normalizeEmail(value) {
  const normalized = value?.toString().trim().toLowerCase() || "";
  return normalized.includes("@") ? normalized : "";
}

function revalidateProfileViews() {
  revalidatePath("/app");
  revalidatePath("/profile");
}

export async function changeStudentPasswordAction(prevState, formData) {
  const currentPassword = formData.get("currentPassword")?.toString() || "";
  const newPassword = formData.get("newPassword")?.toString() || "";
  const confirmPassword = formData.get("confirmPassword")?.toString() || "";

  if (!currentPassword || !newPassword) {
    return formatError("Completa todos los campos.");
  }

  if (newPassword.length < 6) {
    return formatError("La nueva contrasena debe tener al menos 6 caracteres.");
  }

  if (newPassword !== confirmPassword) {
    return formatError("Las contrasenas nuevas no coinciden.");
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
  } = await getAuthenticatedUser(supabase, { label: "profile-change-password" });

  if (!user?.email) {
    return formatError("Inicia sesion nuevamente para actualizar tu perfil.");
  }

  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (reauth.error) {
    return formatError("La contrasena actual no es correcta.");
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return formatError("No pudimos actualizar la contrasena. Intenta mas tarde.");
  }

  await supabase.from("profiles").update({ password_set: true }).eq("id", user.id);
  revalidateProfileViews();
  return formatSuccess("Contrasena actualizada.");
}

export async function changeStudentEmailAction(prevState, formData) {
  const currentPassword = formData.get("emailPassword")?.toString() || "";
  const newEmailRaw = formData.get("newEmail")?.toString();
  const newEmail = normalizeEmail(newEmailRaw);

  if (!currentPassword || !newEmail) {
    return formatError("Completa todos los campos.");
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
  } = await getAuthenticatedUser(supabase, { label: "profile-change-email" });

  if (!user?.email) {
    return formatError("Inicia sesion nuevamente para actualizar tu correo.");
  }

  if (newEmail === user.email.toLowerCase()) {
    return formatError("Ese ya es tu correo actual.");
  }

  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (reauth.error) {
    return formatError("La contrasena no coincide con tu cuenta.");
  }

  const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });
  if (updateError) {
    return formatError("No pudimos actualizar el correo. Intenta mas tarde.");
  }

  await supabase.from("profiles").update({ email: newEmail }).eq("id", user.id);
  revalidateProfileViews();
  return formatSuccess("Actualizamos tu correo. Revisa tu bandeja para confirmarlo.");
}
