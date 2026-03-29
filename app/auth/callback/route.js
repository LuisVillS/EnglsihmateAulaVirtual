import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { getCrmAccessState } from "@/lib/crm/auth";

const NOT_ALLOWED_MESSAGE = "Este correo no se encuentra registrado en el aula virtual";
const GOOGLE_ERROR_MESSAGE = "No se pudo iniciar sesion con Google.";

function buildRedirect(request, path) {
  return NextResponse.redirect(new URL(path, request.url));
}

function buildErrorRedirect(request, message) {
  const url = new URL("/", request.url);
  if (message) {
    url.searchParams.set("error", message);
  }
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams;

  const errorDescription = searchParams.get("error_description");
  if (errorDescription) {
    await supabase.auth.signOut();
    return buildErrorRedirect(request, errorDescription);
  }

  const code = searchParams.get("code");
  let user = null;
  if (code) {
    const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      await supabase.auth.signOut();
      return buildErrorRedirect(request, GOOGLE_ERROR_MESSAGE);
    }
    user = exchangeData?.user || exchangeData?.session?.user || null;
  }

  if (!user) {
    return buildErrorRedirect(request, GOOGLE_ERROR_MESSAGE);
  }

  const accessState = await getCrmAccessState(supabase, user.id);

  if (accessState?.isClassicAdmin) {
    if (accessState.adminProfile?.invited === false) {
      if (hasServiceRoleClient()) {
        try {
          const service = getServiceSupabaseClient();
          await service.auth.admin.deleteUser(user.id);
        } catch (error) {
          console.error("No se pudo eliminar usuario no autorizado", error);
        }
      }

      await supabase.auth.signOut();
      return buildErrorRedirect(request, NOT_ALLOWED_MESSAGE);
    }

    if (
      !accessState.adminProfile?.email ||
      accessState.adminProfile.email.toLowerCase() !== user.email?.toLowerCase()
    ) {
      await supabase
        .from("admin_profiles")
        .update({ email: user.email?.toLowerCase() || accessState.adminProfile?.email })
        .eq("id", user.id);
    }
    return buildRedirect(request, "/admin");
  }

  if (accessState?.isCrmRole) {
    return buildRedirect(request, "/admin/crm");
  }

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("invited, email, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError && String(profileError.message || "").toLowerCase().includes("status")) {
    const fallback = await supabase
      .from("profiles")
      .select("invited, email, role")
      .eq("id", user.id)
      .maybeSingle();
    profile = fallback.data;
    profileError = fallback.error;
  }
  if (profileError) {
    await supabase.auth.signOut();
    return buildErrorRedirect(request, "No se pudo validar tu acceso.");
  }

  if (!profile?.invited) {
    if (hasServiceRoleClient()) {
      try {
        const service = getServiceSupabaseClient();
        await service.auth.admin.deleteUser(user.id);
      } catch (error) {
        console.error("No se pudo eliminar usuario no autorizado", error);
      }
    }

    await supabase.auth.signOut();
    return buildErrorRedirect(request, NOT_ALLOWED_MESSAGE);
  }

  if (!profile.email || profile.email.toLowerCase() !== user.email?.toLowerCase()) {
    await supabase
      .from("profiles")
      .update({ email: user.email?.toLowerCase() || profile.email })
      .eq("id", user.id);
  }

  if (profile?.role === "admin") {
    await supabase.auth.signOut();
    return buildErrorRedirect(request, "No tienes acceso admin desde este portal.");
  }

  return buildRedirect(request, "/app");
}
