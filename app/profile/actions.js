"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/auth-monitor";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

function normalizeText(value) {
  return value?.toString().trim() || "";
}

export async function updateProfileAction(prevState, formData) {
  const fullName = normalizeText(formData.get("fullName"));
  const dni = normalizeText(formData.get("dni"));

  if (!fullName) {
    return { status: "error", message: "El nombre completo es obligatorio." };
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
  } = await getAuthenticatedUser(supabase, { label: "profile-update-action" });

  if (!user) {
    return { status: "error", message: "Inicia sesión nuevamente." };
  }

  const normalizedEmail = user.email?.toLowerCase() || "";
  if (hasServiceRoleClient() && normalizedEmail) {
    const service = getServiceSupabaseClient();
    const { data: adminRow } = await service
      .from("admin_profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (adminRow?.id) {
      await service
        .from("admin_profiles")
        .update({
          full_name: fullName,
          dni: dni || null,
        })
        .eq("id", adminRow.id);
    } else {
      const { data: existingStudent } = await service
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (existingStudent?.id) {
        await service
          .from("profiles")
          .update({
            full_name: fullName,
            dni: dni || null,
          })
          .eq("id", existingStudent.id);
      } else {
        await service.from("profiles").insert({
          id: user.id,
          email: normalizedEmail,
          full_name: fullName,
          dni: dni || null,
          invited: true,
          role: "non_student",
          status: "pre_registered",
        });
      }
    }
  } else {
    const { data: adminRow } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (adminRow?.id) {
      await supabase
        .from("admin_profiles")
        .update({
          full_name: fullName,
          dni: dni || null,
        })
        .eq("id", user.id);
    } else {
      await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          dni: dni || null,
        })
        .eq("id", user.id);
    }
  }

  revalidatePath("/profile");
  redirect("/profile?updated=1");
}

export async function startLinkProviderAction(formData) {
  const provider = formData.get("provider")?.toString();
  if (!provider) {
    redirect("/profile?error=Proveedor+invalido");
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const forwardedHost = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const derivedOrigin =
    forwardedHost && forwardedProto ? `${forwardedProto}://${forwardedHost}` : null;
  const origin = derivedOrigin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${origin}/profile`,
    },
  });

  if (error || !data?.url) {
    const rawMessage = String(error?.message || "");
    const debugParts = [error?.code, error?.status, rawMessage].filter(Boolean).join(" | ");
    console.error("[Profile] linkIdentity error", { code: error?.code, status: error?.status, message: rawMessage });
    const message = encodeURIComponent(debugParts || "No pudimos iniciar la vinculacion.");
    redirect(`/profile?error=${message}`);
  }

  redirect(data.url);
}
