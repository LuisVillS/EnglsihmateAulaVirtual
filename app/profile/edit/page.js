import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { loadViewerProfiles } from "@/lib/viewer-profiles";
import { updateProfileAction } from "@/app/profile/actions";
import ProfileSecurityCard from "@/components/profile-security-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfileEditPage() {
  const { supabase, user, profile: contextProfile, isAdmin } = await getRequestUserContext();

  if (!user) {
    redirect("/");
  }

  let { adminProfile: resolvedAdmin, studentProfile: resolvedStudent } = await loadViewerProfiles({
    supabase,
    user,
    contextProfile,
    isAdmin,
    minimalStudent: true,
  });
  const normalizedEmail = user.email?.toLowerCase();

  let profile = resolvedStudent || resolvedAdmin;

  if (!profile && hasServiceRoleClient() && normalizedEmail) {
    const service = getServiceSupabaseClient();
    const { data: createdProfile } = await service
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: normalizedEmail,
          full_name: user.user_metadata?.full_name || null,
          invited: true,
          role: "non_student",
          status: "pre_registered",
        },
        { onConflict: "email" }
      )
      .select("full_name, email, role, student_code, dni")
      .maybeSingle();
    if (createdProfile) {
      resolvedStudent = createdProfile;
      profile = createdProfile;
    }
  }

  if (!profile) {
    profile = {
      email: user.email,
      full_name: user.user_metadata?.full_name || "",
      dni: "",
    };
  }

  return (
    <section className="relative min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-muted">Editar perfil</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Informacion personal</h1>
            <p className="text-sm text-muted">Actualiza tus datos basicos y manten tu acceso siempre seguro.</p>
          </div>
          <Link
            href="/profile"
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface"
          >
            Volver al perfil
          </Link>
        </div>

        <div className="space-y-6">
          <form action={updateProfileAction} className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-lg shadow-black/20">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre completo</label>
              <input
                type="text"
                name="fullName"
                defaultValue={profile.full_name || ""}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="Nombre y apellido"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">DNI / ID</label>
              <input
                type="text"
                name="dni"
                defaultValue={profile.dni || ""}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                placeholder="Documento"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  readOnly
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted"
                />
              </div>
              {resolvedStudent ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Codigo de alumno</label>
                  <input
                    type="text"
                    value={resolvedStudent.student_code || "Asignado por admin"}
                    readOnly
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted"
                  />
                </div>
              ) : null}
            </div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/25 transition hover:bg-primary-2"
            >
              Guardar cambios
            </button>
          </form>

          <ProfileSecurityCard email={profile.email} />
        </div>
      </div>
    </section>
  );
}
