import Link from "next/link";
import { redirect } from "next/navigation";
import StudentHubCard from "@/components/student-hub-card";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";

export const metadata = {
  title: "Matrícula y Trámites | Aula Virtual",
};

const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_WA_URL || "https://wa.me/";

function formatDateLabel(value) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return parsed.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Lima",
  });
}

function formatMonthLabel(value) {
  if (!value) return "";
  const [yearRaw, monthRaw] = String(value).slice(0, 7).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const parsed = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  return parsed.toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function resolvePreEnrollmentStatusMeta(status) {
  const normalized = String(status || "").toUpperCase();
  const statusMap = {
    PAYMENT_SUBMITTED: {
      label: "En proceso",
      className: "bg-[#ffe8d7] text-[#a35b1f]",
      dotClassName: "bg-[#df7d2f]",
    },
    PAID_AUTO: {
      label: "Completado",
      className: "bg-[#daf4df] text-[#1d7b3f]",
      dotClassName: "bg-[#1fa44c]",
    },
    RESERVED: {
      label: "Reservado",
      className: "bg-[#e8ecf7] text-[#4a5f89]",
      dotClassName: "bg-[#6078ad]",
    },
    EMAIL_VERIFIED: {
      label: "Pendiente",
      className: "bg-[#edf1f7] text-[#4f627f]",
      dotClassName: "bg-[#7084a3]",
    },
    EXPIRED: {
      label: "Vencido",
      className: "bg-[#ffe1e1] text-[#ad3d3d]",
      dotClassName: "bg-[#d65a5a]",
    },
    PENDING_EMAIL_VERIFICATION: {
      label: "Pendiente",
      className: "bg-[#edf1f7] text-[#4f627f]",
      dotClassName: "bg-[#7084a3]",
    },
  };

  return (
    statusMap[normalized] || {
      label: "Pendiente",
      className: "bg-[#edf1f7] text-[#4f627f]",
      dotClassName: "bg-[#7084a3]",
    }
  );
}

function resolvePaymentStatusMeta(status) {
  const normalized = String(status || "").toLowerCase();
  const statusMap = {
    submitted: {
      label: "En proceso",
      className: "bg-[#ffe8d7] text-[#a35b1f]",
      dotClassName: "bg-[#df7d2f]",
    },
    approved: {
      label: "Completado",
      className: "bg-[#daf4df] text-[#1d7b3f]",
      dotClassName: "bg-[#1fa44c]",
    },
    rejected: {
      label: "Observado",
      className: "bg-[#ffe1e1] text-[#ad3d3d]",
      dotClassName: "bg-[#d65a5a]",
    },
    pending: {
      label: "Pendiente",
      className: "bg-[#edf1f7] text-[#4f627f]",
      dotClassName: "bg-[#7084a3]",
    },
  };

  return (
    statusMap[normalized] || {
      label: "Pendiente",
      className: "bg-[#edf1f7] text-[#4f627f]",
      dotClassName: "bg-[#7084a3]",
    }
  );
}

function buildEnrollmentSubtitle(preEnrollment) {
  const level = preEnrollment?.selected_level ? String(preEnrollment.selected_level).toUpperCase() : "";
  const month = formatMonthLabel(preEnrollment?.start_month);
  if (level && month) return `Nivel ${level} · ${month}`;
  if (level) return `Nivel ${level}`;
  if (month) return month;
  return "Expediente administrativo";
}

function buildRecentRequests({ preEnrollment, payments }) {
  const rows = [];

  if (preEnrollment?.id) {
    rows.push({
      id: `pre-${preEnrollment.id}`,
      title: "Solicitud de matrícula",
      subtitle: buildEnrollmentSubtitle(preEnrollment),
      requestedAt: preEnrollment.payment_submitted_at || preEnrollment.updated_at || preEnrollment.created_at || null,
      statusMeta: resolvePreEnrollmentStatusMeta(preEnrollment.status),
      href: "/app/matricula",
      kind: "document",
    });
  }

  for (const payment of payments || []) {
    if (!payment?.id) continue;
    const month = formatMonthLabel(payment.billing_month);
    rows.push({
      id: `payment-${payment.id}`,
      title: "Pago de matrícula",
      subtitle: month ? `Renovación ${month}` : "Renovación mensual",
      requestedAt: payment.approved_at || payment.created_at || null,
      statusMeta: resolvePaymentStatusMeta(payment.status),
      href: "/app/matricula",
      kind: "payment",
    });
  }

  return rows
    .sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime())
    .slice(0, 6);
}

function RequestIcon({ kind = "document" }) {
  const className = "h-4 w-4 text-[#7b879d]";

  if (kind === "payment") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9">
        <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
        <path d="M3.5 10h17" />
        <circle cx="8" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M7 3.5h7l4 4V20a.8.8 0 0 1-.8.8H7.8A.8.8 0 0 1 7 20V3.5Z" />
      <path d="M14 3.5V8h4" />
      <path d="M9.5 12h6M9.5 15h5" />
    </svg>
  );
}

function StatusBadge({ meta }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClassName}`} />
      {meta.label}
    </span>
  );
}

export default async function MatriculaYTramitesPage() {
  const { user, role, supabase } = await getRequestUserContext();

  if (!user) redirect("/login");
  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const [preEnrollmentResult, paymentsResult] = await Promise.all([
    supabase
      .from("pre_enrollments")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("*")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const cards = [
    {
      title: "Mi matrícula",
      description: "Consulta el estado actual de tu inscripción, asignaturas matriculadas y calendario de pagos.",
      href: "/app/matricula",
      icon: "matricula",
      accentClass: "bg-[#dce8ff]",
      iconClass: "text-[#103474]",
    },
    {
      title: "Trámites",
      description: "Solicita certificados, traslados, convalidaciones y otras peticiones administrativas oficiales.",
      href: "/app/tramites",
      icon: "tramites",
      accentClass: "bg-[#ffe3c9]",
      iconClass: "text-[#d97706]",
    },
    {
      title: "Planes de estudio",
      description: "Explora la malla curricular, requisitos de titulación y guías docentes de tu programa.",
      href: "/app/ruta-academica",
      icon: "plan",
      accentClass: "bg-[#e4ddff]",
      iconClass: "text-[#7c3aed]",
    },
    {
      title: "Oportunidades académicas",
      description: "Becas, programas de movilidad internacional, prácticas y convenios empresariales.",
      href: "/app/oportunidades-academicas",
      icon: "opportunities",
      accentClass: "bg-[#d8f0dc]",
      iconClass: "text-[#15803d]",
    },
  ];

  const recentRequests = buildRecentRequests({
    preEnrollment: preEnrollmentResult.error ? null : preEnrollmentResult.data,
    payments: paymentsResult.error ? [] : paymentsResult.data || [],
  });

  return (
    <section className="mx-auto max-w-[1120px] space-y-10 pb-6 pt-1 text-foreground sm:space-y-12">
      <header className="max-w-3xl space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#5f6776]">Centro administrativo</p>
        <h1 className="text-[2.2rem] font-semibold leading-[1.04] tracking-[-0.03em] text-primary sm:text-[3rem]">
          Matrícula y Trámites
        </h1>
        <p className="text-[1.06rem] leading-8 text-[#4f5665] sm:text-[1.15rem]">
          Gestiona tu expediente académico, solicita certificados y mantén al día tu situación administrativa desde un
          solo lugar.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        {cards.map((card) => (
          <StudentHubCard key={card.title} eyebrow="" interactionPolish {...card} />
        ))}
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#666f80]">Seguimiento</p>
            <h2 className="mt-2 text-[2rem] font-semibold leading-[1.06] tracking-[-0.03em] text-primary sm:text-[2.6rem]">
              Estado de Solicitudes Recientes
            </h2>
          </div>
          <Link
            href="/app/matricula"
            className="text-base font-semibold text-primary transition hover:text-primary-2 hover:underline underline-offset-4"
          >
            Ver historial completo
          </Link>
        </div>

        <div className="rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white shadow-[0px_12px_34px_rgba(0,25,67,0.06)]">
          <div className="hidden w-full md:block">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.07)] bg-[#f6f7fb]">
                  <th className="px-7 py-4 text-[12px] font-bold uppercase tracking-[0.17em] text-primary">Trámite / Documento</th>
                  <th className="px-7 py-4 text-[12px] font-bold uppercase tracking-[0.17em] text-primary">Fecha de solicitud</th>
                  <th className="px-7 py-4 text-[12px] font-bold uppercase tracking-[0.17em] text-primary">Estado</th>
                  <th className="px-7 py-4 text-right text-[12px] font-bold uppercase tracking-[0.17em] text-primary">Acción</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.length ? (
                  recentRequests.map((item) => (
                    <tr key={item.id} className="border-b border-[rgba(15,23,42,0.06)] last:border-b-0 hover:bg-[#fbfcff]">
                      <td className="px-7 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f0f3f8]">
                            <RequestIcon kind={item.kind} />
                          </div>
                          <div>
                            <p className="text-[1.12rem] font-semibold leading-6 text-primary">{item.title}</p>
                            <p className="text-xs text-[#7e8799]">{item.subtitle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-7 py-5 text-[1.04rem] text-[#4c5566]">{formatDateLabel(item.requestedAt)}</td>
                      <td className="px-7 py-5">
                        <StatusBadge meta={item.statusMeta} />
                      </td>
                      <td className="px-7 py-5 text-right">
                        <Link
                          href={item.href}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#8b94a8] transition hover:bg-[#eef2f8] hover:text-primary"
                          aria-label={`Abrir ${item.title}`}
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                            <circle cx="12" cy="6" r="1.4" />
                            <circle cx="12" cy="12" r="1.4" />
                            <circle cx="12" cy="18" r="1.4" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-7 py-10 text-center text-sm text-[#687185]">
                      Aún no hay solicitudes recientes disponibles en tu historial.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {recentRequests.length ? (
              recentRequests.map((item) => (
                <article key={item.id} className="rounded-[14px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f0f3f8]">
                        <RequestIcon kind={item.kind} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-semibold leading-6 text-primary">{item.title}</p>
                        <p className="truncate text-xs text-[#7e8799]">{item.subtitle}</p>
                      </div>
                    </div>
                    <StatusBadge meta={item.statusMeta} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.06)] pt-3">
                    <p className="text-xs font-medium text-[#687185]">{formatDateLabel(item.requestedAt)}</p>
                    <Link href={item.href} className="text-xs font-semibold text-primary">
                      Abrir
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-[14px] border border-dashed border-[rgba(16,52,116,0.2)] bg-[#f8fbff] px-4 py-6 text-center text-sm text-[#687185]">
                Aún no hay solicitudes recientes disponibles en tu historial.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#001a4a_0%,#12366f_100%)] px-6 py-8 shadow-[0px_18px_46px_rgba(0,25,67,0.25)] sm:px-10 sm:py-10">
        <div className="absolute -bottom-20 -right-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h3 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              ¿Necesitas ayuda con algún trámite?
            </h3>
            <p className="mt-3 text-[1rem] leading-7 text-white/80 sm:text-[1.08rem]">
              Nuestro equipo de atención al estudiante está disponible para resolver tus dudas administrativas de forma
              personalizada.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center rounded-[18px] bg-white px-7 py-3 text-base font-semibold text-primary transition hover:bg-[#f1f5ff]"
            >
              Hablar con soporte
            </a>
            <Link
              href="/app/tramites"
              className="inline-flex min-h-12 items-center justify-center rounded-[18px] border border-white/25 bg-white/12 px-7 py-3 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Preguntas frecuentes
            </Link>
          </div>
        </div>
      </section>
    </section>
  );
}
