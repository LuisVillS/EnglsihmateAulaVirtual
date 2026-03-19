import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { getDiscordIdentity } from "@/lib/discord-identity";
import { resolveStudentUiLanguage } from "@/lib/student-ui-language";
import ProviderLinkButton from "@/components/provider-link-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || "https://discord.com";

function isMissingDiscordColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("discord_user_id") ||
    message.includes("discord_username") ||
    message.includes("discord_connected_at")
  );
}

function isDiscordLinkConflictError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    (message.includes("duplicate key") && message.includes("discord_user_id")) ||
    message.includes("profiles_discord_user_id_idx")
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

function buildCopy(language) {
  if (language === "en") {
    return {
      eyebrow: "Community",
      title: "Discord",
      intro:
        "Join the student community to stay connected, keep practicing, and extend your English outside class.",
      cardTitle: "Connect your account and join the server",
      cardDescription:
        "Link your Discord account once and use the invite below to enter the student server.",
      linkedEyebrow: "Connection status",
      linkedTitle: "Account linked",
      linkedDescription: "Your Discord account is already connected to this student profile.",
      linkedUsernameLabel: "Username",
      connectLabel: "Connect Discord account",
      connectLoading: "Connecting Discord...",
      joinLabel: "Join Discord server",
      whyEyebrow: "Why join",
      whyTitle: "A community layer around your classroom",
      helpEyebrow: "Need help?",
      helpTitle: "If linking fails",
      helpTextOne: "Try the connection flow again and make sure your browser allowed the Discord popup.",
      helpTextTwo: "If the issue continues, join the server manually and contact support so we can review the mapping.",
      duplicateLinkMessage: "This Discord account is already linked to another student profile.",
      benefitCards: [
        {
          title: "Practice with other students",
          description: "Stay exposed to English outside your regular class schedule.",
          icon: <PeopleIcon />,
        },
        {
          title: "Keep up with announcements",
          description: "Follow updates, reminders, and community activity from one place.",
          icon: <MessageIcon />,
        },
        {
          title: "Keep your account linked",
          description: "Link once so your server access and role sync stay consistent.",
          icon: <ShieldIcon />,
        },
      ],
    };
  }

  return {
    eyebrow: "Comunidad",
    title: "Discord",
    intro:
      "Únete a la comunidad de estudiantes para mantenerte conectado, seguir practicando y usar un espacio compartido fuera de clase.",
    cardTitle: "Conecta tu cuenta y entra al servidor",
    cardDescription:
      "Vincula tu cuenta de Discord una sola vez y usa el acceso de abajo para entrar al servidor de estudiantes.",
    linkedEyebrow: "Estado de conexión",
    linkedTitle: "Cuenta vinculada",
    linkedDescription: "Tu cuenta de Discord ya está conectada a este perfil de estudiante.",
    linkedUsernameLabel: "Username",
    connectLabel: "Conectar cuenta de Discord",
    connectLoading: "Conectando Discord...",
    joinLabel: "Entrar al servidor de Discord",
    whyEyebrow: "Por qué entrar",
    whyTitle: "Una capa de comunidad alrededor de tu curso",
    helpEyebrow: "¿Necesitas ayuda?",
    helpTitle: "Si falla la vinculación",
    helpTextOne: "Intenta otra vez el flujo de conexión y verifica que tu navegador permitió la ventana de Discord.",
    helpTextTwo: "Si el problema continúa, entra manualmente al servidor y contacta soporte para revisar la vinculación.",
    duplicateLinkMessage: "Esta cuenta de Discord ya está vinculada a otro perfil de estudiante.",
    benefitCards: [
      {
        title: "Practica con otros estudiantes",
        description: "Sigue expuesto al inglés fuera de tu horario regular de clases.",
        icon: <PeopleIcon />,
      },
      {
        title: "Mantente al día",
        description: "Revisa avisos, recordatorios y actividad de la comunidad desde un solo lugar.",
        icon: <MessageIcon />,
      },
      {
        title: "Mantén tu cuenta vinculada",
        description: "Vincúlala una vez para que el acceso y la sincronización de roles se mantengan estables.",
        icon: <ShieldIcon />,
      },
    ],
  };
}

export default async function DiscordPage({ searchParams: searchParamsPromise }) {
  const searchParams = (await searchParamsPromise) || {};
  const { supabase, user, profile } = await getRequestUserContext();

  if (!user) {
    redirect("/");
  }

  const uiLanguage = resolveStudentUiLanguage({ courseLevel: profile?.course_level || "", pathname: "/app/discord" });
  const copy = buildCopy(uiLanguage);
  const discordIdentity = getDiscordIdentity(user);
  let mappedDiscord = null;
  let syncIssueMessage = null;

  const { data: profileMapping, error: profileError } = await supabase
    .from("profiles")
    .select("discord_user_id, discord_username, discord_connected_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileError) {
    mappedDiscord = profileMapping;
  } else if (!isMissingDiscordColumnError(profileError)) {
    console.error("No se pudo cargar mapeo de Discord", profileError);
  }

  const discordNeedsSync = Boolean(
    discordIdentity?.id &&
      (
        mappedDiscord?.discord_user_id !== discordIdentity.id ||
        (mappedDiscord?.discord_username || null) !== (discordIdentity.username || null) ||
        !mappedDiscord?.discord_connected_at
      )
  );

  if (discordNeedsSync) {
    const discordPayload = {
      discord_user_id: discordIdentity.id,
      discord_username: discordIdentity.username || null,
      discord_connected_at: new Date().toISOString(),
    };

    if (hasServiceRoleClient()) {
      const service = getServiceSupabaseClient();
      const { error: syncError } = await service.from("profiles").update(discordPayload).eq("id", user.id);
      if (syncError && !isMissingDiscordColumnError(syncError)) {
        if (isDiscordLinkConflictError(syncError)) {
          syncIssueMessage = copy.duplicateLinkMessage;
        } else {
          console.error("No se pudo sincronizar Discord en app/discord", syncError);
        }
      } else if (!syncError) {
        mappedDiscord = { ...(mappedDiscord || {}), ...discordPayload };
      }
    } else {
      const { error: syncError } = await supabase.from("profiles").update(discordPayload).eq("id", user.id);
      if (syncError && !isMissingDiscordColumnError(syncError)) {
        if (isDiscordLinkConflictError(syncError)) {
          syncIssueMessage = copy.duplicateLinkMessage;
        } else {
          console.error("No se pudo sincronizar Discord en app/discord", syncError);
        }
      } else if (!syncError) {
        mappedDiscord = { ...(mappedDiscord || {}), ...discordPayload };
      }
    }
  }

  const linked = Boolean(mappedDiscord?.discord_user_id);
  const discordUsername = mappedDiscord?.discord_username || discordIdentity?.username || null;
  const rawError = searchParams?.error?.toString();
  const errorMessage = rawError ? decodeURIComponent(rawError) : null;

  return (
    <section className="space-y-8 text-foreground">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <header className="student-panel relative overflow-hidden px-6 py-7 sm:px-7">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-[80px] bg-[linear-gradient(135deg,rgba(16,52,116,0.14),rgba(16,52,116,0.03))]" />
          <p className="text-xs uppercase tracking-[0.4em] text-muted">{copy.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-[2.65rem]">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">{copy.intro}</p>
        </header>

        <aside className="student-panel px-6 py-7 sm:px-7">
          <h2 className="text-2xl font-semibold text-foreground">{copy.cardTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">{copy.cardDescription}</p>

          <div className="mt-6 grid gap-3">
            {linked ? (
              <div className="student-panel-soft px-4 py-4">
                <p className="text-xs uppercase tracking-[0.24em] text-success">{copy.linkedEyebrow}</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{copy.linkedTitle}</p>
                <p className="mt-2 text-sm text-muted">{copy.linkedDescription}</p>
                <p className="mt-3 text-sm text-foreground">
                  <span className="font-semibold">{copy.linkedUsernameLabel}:</span>{" "}
                  {discordUsername || (uiLanguage === "en" ? "Unavailable" : "Sin username")}
                </p>
              </div>
            ) : (
              <ProviderLinkButton
                provider="discord"
                redirectPath="/app/discord"
                openInNewWindow
                label={copy.connectLabel}
                loadingLabel={copy.connectLoading}
                className="student-button-primary px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
              />
            )}

            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="student-button-secondary justify-center bg-surface-2 px-4 py-3 text-sm"
            >
              {copy.joinLabel}
            </a>
          </div>
        </aside>
      </div>

      {errorMessage ? (
        <div className="rounded-[12px] border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}
      {syncIssueMessage ? (
        <div className="rounded-[12px] border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
          {syncIssueMessage}
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.36em] text-muted">{copy.whyEyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.whyTitle}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {copy.benefitCards.map((card) => (
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
            <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.helpEyebrow}</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">{copy.helpTitle}</h3>
          </div>
          <div className="text-sm leading-6 text-muted">{copy.helpTextOne}</div>
          <div className="text-sm leading-6 text-muted">{copy.helpTextTwo}</div>
        </div>
      </section>
    </section>
  );
}
