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

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H17.5A2.5 2.5 0 0 1 20 6.5v6A2.5 2.5 0 0 1 17.5 15H10l-4 4v-4H6.5A2.5 2.5 0 0 1 4 12.5v-6Z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 19a4 4 0 0 0-8 0" />
      <circle cx="12" cy="11" r="3" />
      <path d="M20 19a4 4 0 0 0-3-3.87M4 19a4 4 0 0 1 3-3.87" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v5c0 4.4-2.9 8.5-7 10-4.1-1.5-7-5.6-7-10V6l7-3Z" />
    </svg>
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

  const benefitCards = [
    {
      title: "Practice with other students",
      description: "Use the community space to stay exposed to English outside of your regular class schedule.",
      icon: <PeopleIcon />,
    },
    {
      title: "Keep up with announcements",
      description: "Stay close to updates, reminders, and extra community activity without losing momentum.",
      icon: <MessageIcon />,
    },
    {
      title: "Keep your account linked",
      description: "Link your Discord identity once so joining the community stays simple and consistent.",
      icon: <ShieldIcon />,
    },
  ];

  return (
    <section className="space-y-8 text-foreground">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <header className="student-panel relative overflow-hidden px-6 py-7 sm:px-7">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-[80px] bg-[linear-gradient(135deg,rgba(16,52,116,0.14),rgba(16,52,116,0.03))]" />
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Community</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-[2.65rem]">
            Discord
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            Join the student community to stay connected, keep practicing, and use a shared space that supports your learning rhythm.
          </p>
        </header>

        <aside className="student-panel px-6 py-7 sm:px-7">
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Your access</p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">Connect your account and join the server</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Use the two actions below to link your Discord identity and enter the community server without changing your current student flow.
          </p>

          <div className="mt-6 grid gap-3">
            {linked ? (
              <div className="student-panel-soft px-4 py-4">
                <p className="text-xs uppercase tracking-[0.24em] text-success">Connection status</p>
                <p className="mt-2 text-xl font-semibold text-foreground">Cuenta vinculada</p>
                <p className="mt-2 text-sm text-muted">Your Discord identity is already connected to this student profile.</p>
              </div>
            ) : (
              <ProviderLinkButton
                provider="discord"
                redirectPath="/app/discord"
                openInNewWindow
                label="Connect Discord account"
                loadingLabel="Connecting Discord..."
                className="student-button-primary px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
              />
            )}

            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="student-button-secondary justify-center bg-surface-2 px-4 py-3 text-sm"
            >
              Join Discord server
            </a>
          </div>

          {linked ? (
            <div className="student-panel-soft mt-5 space-y-1 px-4 py-4 text-sm text-muted">
              <p className="font-semibold text-foreground">Active connection</p>
              <p>Username: {discordUsername || "Not available"}</p>
              <p>ID: {discordUserId || "Not available"}</p>
            </div>
          ) : null}
        </aside>
      </div>

      {errorMessage ? (
        <div className="rounded-[12px] border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.36em] text-muted">Why join</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">A community layer around your classroom</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {benefitCards.map((card) => (
            <article key={card.title} className="student-panel px-5 py-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#eef3fb] text-[#103474]">
                {card.icon}
              </span>
              <h3 className="mt-4 text-xl font-semibold text-foreground">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="student-panel px-6 py-6 sm:px-7">
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Need help?</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">If linking fails</h3>
          </div>
          <div className="text-sm leading-6 text-muted">
            First try the connect action again and make sure the Discord popup was allowed in your browser.
          </div>
          <div className="text-sm leading-6 text-muted">
            If the problem continues, join the server manually and contact support so the account mapping can be checked.
          </div>
        </div>
      </section>
    </section>
  );
}
