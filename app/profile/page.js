import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import ProviderLinkButton from "@/components/provider-link-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROVIDERS = [
  { id: "google", label: "Google", icon: "G" },
  { id: "discord", label: "Discord", icon: "D" },
];
const STUDENT_PROFILE_SELECT = `
  id,
  email,
  role,
  student_code,
  full_name,
  dni,
  enrollment_date,
  commission_assigned_at,
  commission_id,
  commission:course_commissions (
    id,
    course_level,
    commission_number,
    start_date,
    end_date,
    start_time,
    end_time,
    modality_key,
    status,
    is_active
  )
`;

function formatRole(role) {
  return role === "admin" ? "Administrador" : "Estudiante";
}

function formatDateLabel(value) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es", { month: "short", year: "numeric" }).format(date);
}

function formatDateFull(value) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(date);
}

function formatTimeLabel(value) {
  if (!value) return "--:--";
  return String(value).slice(0, 5);
}

function formatCommissionStatus(commission) {
  const isActive = commission?.status === "active" || commission?.is_active;
  return isActive ? "Activa" : "Inactiva";
}

function getDiscordIdentity(user) {
  const discordIdentity = (user?.identities || []).find((identity) => identity?.provider === "discord");
  if (!discordIdentity) return null;

  const identityData = discordIdentity.identity_data || {};
  const discordUserId =
    identityData.sub ||
    discordIdentity.provider_id ||
    discordIdentity.id ||
    null;
  if (!discordUserId) return null;

  const discordUsername =
    identityData.global_name ||
    identityData.preferred_username ||
    identityData.username ||
    null;

  return {
    id: discordUserId,
    username: discordUsername,
  };
}

function isMissingDiscordColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("discord_user_id") ||
    message.includes("discord_username") ||
    message.includes("discord_connected_at")
  );
}

export default async function ProfilePage({ searchParams: searchParamsPromise }) {
  const searchParams = (await searchParamsPromise) || {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: adminProfile } = await supabase
    .from("admin_profiles")
    .select("id, email, full_name, dni")
    .eq("id", user.id)
    .maybeSingle();

  const { data: studentProfile } = await supabase
    .from("profiles")
    .select(STUDENT_PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  let resolvedAdmin = adminProfile;
  let resolvedStudent = studentProfile;

  const normalizedEmail = user.email?.toLowerCase();

  if (hasServiceRoleClient()) {
    const service = getServiceSupabaseClient();

    const { data: studentByEmail } = normalizedEmail
      ? await service
          .from("profiles")
          .select(STUDENT_PROFILE_SELECT)
          .eq("email", normalizedEmail)
          .maybeSingle()
      : { data: null };

    const { data: studentById } = await service
      .from("profiles")
      .select(STUDENT_PROFILE_SELECT)
      .eq("id", user.id)
      .maybeSingle();

    const { data: adminByEmail } = normalizedEmail
      ? await service
          .from("admin_profiles")
          .select("id, email, full_name, dni")
          .eq("email", normalizedEmail)
          .maybeSingle()
      : { data: null };

    const { data: adminById } = await service
      .from("admin_profiles")
      .select("id, email, full_name, dni")
      .eq("id", user.id)
      .maybeSingle();

    resolvedStudent = studentByEmail || studentById || resolvedStudent;
    resolvedAdmin = adminByEmail || adminById || resolvedAdmin;
  }

  const discordIdentity = getDiscordIdentity(user);
  if (resolvedStudent?.id && discordIdentity?.id) {
    const discordPayload = {
      discord_user_id: discordIdentity.id,
      discord_username: discordIdentity.username || null,
      discord_connected_at: new Date().toISOString(),
    };

    if (hasServiceRoleClient()) {
      const service = getServiceSupabaseClient();
      const { error: syncError } = await service
        .from("profiles")
        .update(discordPayload)
        .eq("id", resolvedStudent.id);
      if (syncError && !isMissingDiscordColumnError(syncError)) {
        console.error("No se pudo sincronizar Discord en el perfil", syncError);
      }
    } else {
      const { error: syncError } = await supabase
        .from("profiles")
        .update(discordPayload)
        .eq("id", resolvedStudent.id);
      if (syncError && !isMissingDiscordColumnError(syncError)) {
        console.error("No se pudo sincronizar Discord en el perfil", syncError);
      }
    }
  }

  const role = resolvedStudent?.role || (resolvedAdmin ? "admin" : "student");
  const profile =
    resolvedStudent ||
    resolvedAdmin || {
      id: user.id,
      email: user.email,
      full_name: null,
      dni: null,
    };
  const studentProfileId = resolvedStudent?.id || user.id;

  const { data: enrollments } = await supabase
    .from("course_enrollments")
    .select("id, created_at, course:courses (id, title, level)")
    .eq("user_id", studentProfileId)
    .order("created_at", { ascending: false });

  const activeCommission = resolvedStudent?.commission?.id
    ? {
        ...resolvedStudent.commission,
        assigned_at: resolvedStudent.commission_assigned_at || resolvedStudent.enrollment_date || null,
      }
    : null;
  const commissionCards = activeCommission ? [activeCommission] : [];
  const totalCourses = commissionCards.length || (enrollments || []).length;

  const connectedProviders = new Set(user.identities?.map((identity) => identity.provider));
  const fullName = profile.full_name || user.user_metadata?.full_name || user.email;
  const infoBanner =
    searchParams?.updated === "1"
      ? "Perfil actualizado correctamente."
      : searchParams?.error || null;

  return (
    <section className="relative min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-10 h-72 w-72 rounded-full bg-primary/20 blur-[160px]" />
        <div className="absolute bottom-0 right-10 h-80 w-80 rounded-full bg-accent/12 blur-[180px]" />
      </div>
      <div className="relative mx-auto w-full max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted">Mi perfil</p>
            <h1 className="mt-2 text-4xl font-semibold">{fullName}</h1>
            <p className="text-sm text-muted">{formatRole(role)}</p>
          </div>
          <Link
            href="/profile/edit"
            className="rounded-2xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/30 transition hover:bg-primary-2"
          >
            Editar perfil
          </Link>
        </div>
        {infoBanner ? (
          <div className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
            {infoBanner}
          </div>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-surface p-6 backdrop-blur">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-2 text-3xl font-semibold">
                  {fullName.charAt(0)}
                </div>
                <div>
                  <p className="text-xl font-semibold">{fullName}</p>
                  <p className="text-sm text-muted">{formatRole(role)}</p>
                </div>
              </div>
              <div className="mt-6 space-y-3 text-sm text-muted">
                <p>
                  <span className="text-muted/80">Email</span>
                  <br />
                  <span className="text-foreground">{profile.email}</span>
                </p>
                {resolvedStudent ? (
                  <p>
                    <span className="text-muted/80">Codigo alumno</span>
                    <br />
                    <span className="text-foreground">{resolvedStudent.student_code || "Asignado por admin"}</span>
                  </p>
                ) : null}
                <p>
                  <span className="text-muted/80">DNI / ID</span>
                  <br />
                  <span className="text-foreground">{profile.dni || "Sin registrar"}</span>
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-surface p-6 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.4em] text-muted">Cuentas vinculadas</p>
              <div className="mt-4 space-y-4">
                {PROVIDERS.map((provider) => {
                  const connected = connectedProviders.has(provider.id);
                  return (
                    <div
                      key={provider.id}
                      className="flex items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-surface text-lg font-semibold">
                          {provider.icon}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{provider.label}</p>
                          <p className="text-xs text-muted">
                            {connected
                              ? provider.id === "discord"
                                ? discordIdentity?.username || `ID ${discordIdentity?.id || "-"}`
                                : "Conectado"
                              : "No conectado"}
                          </p>
                        </div>
                      </div>
                      {connected ? (
                        <span className="rounded-full border border-success/35 px-3 py-1 text-xs font-semibold text-success">
                          Activo
                        </span>
                      ) : (
                        <ProviderLinkButton provider={provider.id} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-surface p-6 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-muted">Educacion en Englishmate</p>
                  <h2 className="mt-2 text-2xl font-semibold">Mis cursos</h2>
                </div>
                <span className="text-sm text-muted">{totalCourses} cursos</span>
              </div>
              <div className="mt-6 space-y-4">
                {!commissionCards.length && (enrollments || []).length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                    Todavia no tienes cursos asignados.
                  </p>
                ) : commissionCards.length ? (
                  commissionCards.map((commission) => (
                    <div key={commission.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                      <p className="text-sm font-semibold">
                        {commission.course_level} - Comision #{commission.commission_number}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {formatDateFull(commission.start_date)} - {formatDateFull(commission.end_date)}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                        <span>
                          Horario {formatTimeLabel(commission.start_time)} - {formatTimeLabel(commission.end_time)}
                        </span>
                        <span className="rounded-full border border-accent/35 px-3 py-0.5 text-accent">
                          {formatCommissionStatus(commission)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        Asignado: {formatDateFull(commission.assigned_at)}
                      </p>
                    </div>
                  ))
                ) : (
                  enrollments.map((enrollment) => (
                    <div key={enrollment.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                      <p className="text-sm font-semibold">{enrollment.course?.title || "Curso sin nombre"}</p>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted">
                        <span>{formatDateLabel(enrollment.created_at)}</span>
                        <span className="rounded-full border border-accent/35 px-3 py-0.5 text-accent">
                          En progreso
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-surface p-6 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.4em] text-muted">Experiencia</p>
              <p className="mt-3 text-sm text-muted">
                Pronto podras registrar otras certificaciones y workshops completados.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
