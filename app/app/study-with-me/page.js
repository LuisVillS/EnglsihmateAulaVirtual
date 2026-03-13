import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import {
  STUDY_WITH_ME_SESSION_MINUTES,
  STUDY_WITH_ME_WEEKLY_LIMIT,
  getStudyWithMeAccess,
} from "@/lib/study-with-me-access";

export const metadata = {
  title: "Study With Me | Aula Virtual",
};

const STUDY_WITH_ME_CALENDLY_URL =
  process.env.CALENDLY_STUDY_WITH_ME_URL ||
  process.env.NEXT_PUBLIC_CALENDLY_STUDY_WITH_ME_URL ||
  "";

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
}

function buildCalendlyUrl({ baseUrl, email, name }) {
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    if (email) url.searchParams.set("email", email);
    if (name) url.searchParams.set("name", name);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

export default async function StudyWithMePage() {
  const { supabase, user } = await getRequestUserContext();

  if (!user) redirect("/login");

  const access = await getStudyWithMeAccess({ supabase, userId: user.id });
  if (!access.canAccessPage) {
    redirect("/app/matricula?locked=1");
  }

  const calendlyUrl = buildCalendlyUrl({
    baseUrl: STUDY_WITH_ME_CALENDLY_URL,
    email: access?.profile?.email || user.email || "",
    name: access?.profile?.full_name || "",
  });
  const canBookNow = Boolean(calendlyUrl);

  return (
    <section className="space-y-6 text-foreground">
      <header className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">Premium</p>
        <h1 className="mt-2 text-3xl font-semibold">Study With Me</h1>
        <p className="mt-2 text-sm text-muted">
          Reserva una sesion 1:1 para practicar contigo en vivo.
        </p>
      </header>

      <article className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Duracion</p>
            <p className="mt-2 text-2xl font-semibold">{STUDY_WITH_ME_SESSION_MINUTES} min</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Limite semanal</p>
            <p className="mt-2 text-2xl font-semibold">{STUDY_WITH_ME_WEEKLY_LIMIT} sesion</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Semana actual</p>
            <p className="mt-2 text-sm text-foreground">
              {formatDate(access.weekStartKey)} al {formatDate(access.weekEndKey)}
            </p>
          </div>
        </div>

        {!calendlyUrl ? (
          <div className="mt-5 rounded-2xl border border-danger/35 bg-danger/10 p-4 text-sm text-danger">
            Falta configurar el link de Calendly (`CALENDLY_STUDY_WITH_ME_URL`).
          </div>
        ) : null}

        <div className="mt-5">
          {canBookNow ? (
            <a
              href={calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              Reservar mi sesion 1:1
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center rounded-xl border border-border bg-surface-2 px-5 py-2.5 text-sm font-semibold text-muted"
            >
              Reserva no disponible
            </button>
          )}
        </div>
      </article>
    </section>
  );
}
