import Link from "next/link";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import {
  AdminCard,
  AdminEmptyState,
  AdminPage,
  AdminPageHeader,
  AdminStatCard,
  AdminStatsGrid,
} from "@/components/admin-page";
import AdminDiscordRoster from "@/components/admin-discord-roster";
import {
  getDiscordMemberDisplayName,
  isManagedDiscordRoleName,
  listDiscordGuildMembers,
  getDiscordGuildRoles,
  mapMemberRoleNames,
  resolveDiscordGuildId,
  resolveExpectedDiscordRole,
} from "@/lib/discord-admin";

export const metadata = {
  title: "Discord | Admin | Aula Virtual",
};

function toneForMember(row) {
  if (row.isBot) return "neutral";
  if (!row.linkedStudent) return "warning";
  if (row.expectedRole && row.currentManagedRoles.includes(row.expectedRole) && row.currentManagedRoles.length === 1) {
    return "success";
  }
  if (!row.expectedRole && row.currentManagedRoles.length === 0) {
    return "success";
  }
  return "danger";
}

function labelForMember(row) {
  if (row.isBot) return "Bot";
  if (!row.linkedStudent) return "Sin vincular";
  if (row.expectedRole && row.currentManagedRoles.includes(row.expectedRole) && row.currentManagedRoles.length === 1) {
    return "Sincronizado";
  }
  if (!row.expectedRole && row.currentManagedRoles.length === 0) {
    return "Sin rol gestionado";
  }
  return "Desajuste";
}

export default async function AdminDiscordPage({ searchParams: searchParamsPromise }) {
  await requireAdminPageAccess();
  const searchParams = (await searchParamsPromise) || {};
  const successMessage = typeof searchParams?.success === "string" ? searchParams.success : "";
  const errorMessage = typeof searchParams?.error === "string" ? searchParams.error : "";
  const updatedCount = Number.parseInt(typeof searchParams?.updated === "string" ? searchParams.updated : "", 10);

  const guildId = await resolveDiscordGuildId();
  const [roles, members] = guildId
    ? await Promise.all([
        getDiscordGuildRoles(guildId),
        listDiscordGuildMembers(guildId),
      ])
    : [[], []];

  const rolesById = new Map((roles || []).map((role) => [String(role.id), role]));
  const service = hasServiceRoleClient() ? getServiceSupabaseClient() : null;
  const { data: linkedProfiles, error: profilesError } = service
    ? await service
        .from("profiles")
        .select(
          `
          id,
          email,
          full_name,
          role,
          status,
          course_level,
          start_month,
          enrollment_date,
          discord_user_id,
          discord_username,
          discord_connected_at,
          commission_id,
          commission:course_commissions (
            id,
            course_level,
            start_date,
            start_month,
            end_date,
            status,
            is_active
          )
        `
        )
        .not("discord_user_id", "is", null)
    : { data: [], error: null };

  if (profilesError) {
    console.error("No se pudieron cargar perfiles de Discord", profilesError);
  }

  const profilesByDiscordId = new Map(
    (linkedProfiles || []).map((profile) => [String(profile.discord_user_id || "").trim(), profile]).filter(([id]) => id)
  );

  const roster = (members || [])
    .map((member) => {
      const discordUserId = String(member?.user?.id || "").trim();
      const linkedStudent = profilesByDiscordId.get(discordUserId) || null;
      const roleNames = mapMemberRoleNames(member, rolesById);
      const currentManagedRoles = roleNames.filter((roleName) => isManagedDiscordRoleName(roleName));
      const expectedRole = linkedStudent ? resolveExpectedDiscordRole(linkedStudent) : "";
      return {
        discordUserId,
        username: member?.user?.username || "",
        displayName: getDiscordMemberDisplayName(member),
        linkedStudent,
        currentRoles: roleNames,
        currentManagedRoles,
        expectedRole,
        isBot: Boolean(member?.user?.bot),
        statusLabel: "",
        statusTone: "neutral",
        statusKey: "sin_vincular",
      };
    })
    .map((row) => {
      const statusLabel = labelForMember(row);
      const statusTone = toneForMember(row);
      const statusKey = row.isBot
        ? "bot"
        : !row.linkedStudent
          ? "sin_vincular"
          : statusLabel === "Sincronizado"
            ? "sincronizado"
            : statusLabel === "Sin rol gestionado"
              ? "sin_rol"
              : "desajuste";
      return {
        ...row,
        statusLabel,
        statusTone,
        statusKey,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));

  const linkedCount = roster.filter((row) => row.linkedStudent).length;
  const mismatchCount = roster.filter((row) => row.statusLabel === "Desajuste").length;
  const alumniCount = roster.filter((row) => row.expectedRole === "Alumni").length;

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="Operaciones"
        title="Discord"
        description="Revisa a todos los miembros del servidor, compara sus roles actuales con el rol academico esperado y corrige vinculaciones desde un solo panel."
        actions={
          <>
            <Link
              href="/admin"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Volver al panel
            </Link>
          </>
        }
      />

      {successMessage ? (
        <div className="rounded-[18px] border border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.08)] px-4 py-3 text-sm text-[#047857]">
          {successMessage}
        </div>
      ) : null}
      {Number.isFinite(updatedCount) ? (
        <div className="rounded-[18px] border border-[rgba(16,52,116,0.12)] bg-[#eef3ff] px-4 py-3 text-sm text-[#103474]">
          Usernames actualizados en base de datos: {updatedCount}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-[18px] border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[#b91c1c]">
          {errorMessage}
        </div>
      ) : null}

      <AdminStatsGrid>
        <AdminStatCard label="Miembros" value={roster.length} />
        <AdminStatCard label="Alumnos vinculados" value={linkedCount} />
        <AdminStatCard label="Desajustes" value={mismatchCount} />
        <AdminStatCard label="Alumni esperados" value={alumniCount} />
      </AdminStatsGrid>

      <AdminCard className="space-y-4">
        {!roster.length ? (
          <AdminEmptyState title="No hay miembros" description="El bot no pudo cargar miembros desde Discord." />
        ) : (
          <AdminDiscordRoster rows={roster} />
        )}
      </AdminCard>
    </AdminPage>
  );
}
