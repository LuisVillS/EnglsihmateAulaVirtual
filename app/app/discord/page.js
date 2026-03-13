import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import ProviderLinkButton from "@/components/provider-link-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || "https://discord.com";

function getDiscordIdentity(user) {
  const discordIdentity = (user?.identities || []).find((identity) => identity?.provider === "discord");
  if (!discordIdentity) return null;

  const identityData = discordIdentity.identity_data || {};
  const discordUserId = identityData.sub || discordIdentity.provider_id || discordIdentity.id || null;
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

export default async function DiscordPage({ searchParams: searchParamsPromise }) {
  const searchParams = (await searchParamsPromise) || {};
  const { supabase, user } = await getRequestUserContext();

  if (!user) {
    redirect("/");
  }

  const discordIdentity = getDiscordIdentity(user);
  let mappedDiscord = null;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("discord_user_id, discord_username, discord_connected_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileError) {
    mappedDiscord = profile;
  } else if (!isMissingDiscordColumnError(profileError)) {
    console.error("No se pudo cargar mapeo de Discord", profileError);
  }

  const linked = Boolean(discordIdentity?.id || mappedDiscord?.discord_user_id);
  const discordUsername = mappedDiscord?.discord_username || discordIdentity?.username || null;
  const discordUserId = mappedDiscord?.discord_user_id || discordIdentity?.id || null;
  const rawError = searchParams?.error?.toString();
  const errorMessage = rawError ? decodeURIComponent(rawError) : null;

  return (
    <section className="space-y-6 text-foreground">
      <header className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">Comunidad</p>
        <h1 className="mt-2 text-3xl font-semibold">Discord</h1>
        <p className="mt-2 text-sm text-muted">
          Unete a nuestro servidor de Discord y practica ingles con otros alumnos como tu.
        </p>
      </header>

      {errorMessage ? (
        <div className="rounded-2xl border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}

      <article className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {linked ? (
            <span className="inline-flex items-center justify-center rounded-xl border border-success/35 bg-success/12 px-4 py-2 text-sm font-semibold text-success">
              Cuenta vinculada
            </span>
          ) : (
            <ProviderLinkButton
              provider="discord"
              redirectPath="/app/discord"
              openInNewWindow
              label="Conectar cuenta con Discord"
              loadingLabel="Conectando Discord..."
              className="inline-flex items-center justify-center rounded-xl border border-primary/40 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
            />
          )}
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-primary/10"
          >
            Unirme al servidor de Discord
          </a>
        </div>

        {linked ? (
          <div className="mt-4 space-y-1 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
            <p className="font-semibold text-foreground">Conexion activa</p>
            <p>Usuario: {discordUsername || "Sin username disponible"}</p>
            <p>ID: {discordUserId || "Sin ID disponible"}</p>
          </div>
        ) : null}
      </article>
    </section>
  );
}
