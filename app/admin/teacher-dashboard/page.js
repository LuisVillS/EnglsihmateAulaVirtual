import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { loadTeacherDashboardData } from "@/lib/duolingo/teacher-analytics";

export const metadata = {
  title: "Teacher Dashboard | Admin",
};

function MetricCard({ label, value }) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </article>
  );
}

function RankingTable({ title, rows, keyLabel = "item", valueLabel = "errores" }) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[280px] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-2">{keyLabel}</th>
              <th className="pb-2 text-right">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row) => (
              <tr key={`${row.key}-${row.count}`} className="border-t border-border/50">
                <td className="py-2">{row.key}</td>
                <td className="py-2 text-right font-semibold">{row.count}</td>
              </tr>
            ))}
            {!rows?.length ? (
              <tr>
                <td className="py-2 text-muted" colSpan={2}>
                  Sin datos en este filtro.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default async function TeacherDashboardPage({ searchParams }) {
  const params = searchParams || {};
  const from = params.from || "";
  const to = params.to || "";
  const level = params.level || "";
  const commissionId = params.commission_id || "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    redirect("/admin/login");
  }

  const db = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;

  const [dashboard, commissionsResult] = await Promise.all([
    loadTeacherDashboardData({
      db,
      filters: {
        from,
        to,
        level,
        commissionId,
      },
    }),
    db
      .from("course_commissions")
      .select("id, course_level, commission_number")
      .order("course_level", { ascending: true })
      .order("commission_number", { ascending: true }),
  ]);

  const commissions = commissionsResult.data || [];

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8 text-foreground">
      <header className="rounded-3xl border border-border bg-surface p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">Teacher Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold">Insights por clase y ejercicio</h1>
        <p className="mt-2 text-sm text-muted">
          Métricas de accuracy, streak promedio y ranking de errores para acciones docentes.
        </p>
      </header>

      <form className="grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-5">
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        />
        <input
          type="text"
          name="level"
          defaultValue={level}
          placeholder="A1 / A2 / B1"
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        />
        <select
          name="commission_id"
          defaultValue={commissionId}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          <option value="">Todas las comisiones</option>
          {commissions.map((commission) => (
            <option key={commission.id} value={commission.id}>
              {commission.course_level} - #{commission.commission_number}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Filtrar
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Attempts" value={dashboard.totals.attempts} />
        <MetricCard label="Accuracy" value={`${dashboard.totals.accuracy}%`} />
        <MetricCard label="Students" value={dashboard.totals.students} />
        <MetricCard label="Avg Streak" value={dashboard.totals.averageStreak} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankingTable title="Errores por lección" rows={dashboard.rankings.byLesson} keyLabel="Lección" />
        <RankingTable title="Errores por tema" rows={dashboard.rankings.bySubject} keyLabel="Tema" />
        <RankingTable title="Errores por tipo" rows={dashboard.rankings.byType} keyLabel="Tipo" />
      </div>

      <article className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-lg font-semibold">Ejercicios más fallados</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2">Exercise ID</th>
                <th className="pb-2">Lección</th>
                <th className="pb-2">Tema</th>
                <th className="pb-2">Tipo</th>
                <th className="pb-2 text-right">Errores</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard.rankings.hardestExercises || []).map((row) => (
                <tr key={row.exercise_id} className="border-t border-border/50">
                  <td className="py-2 font-mono text-xs">{row.exercise_id}</td>
                  <td className="py-2">{row.lesson_title}</td>
                  <td className="py-2">{row.subject}</td>
                  <td className="py-2 uppercase">{row.type}</td>
                  <td className="py-2 text-right font-semibold">{row.errors}</td>
                </tr>
              ))}
              {!dashboard.rankings.hardestExercises?.length ? (
                <tr>
                  <td className="py-2 text-muted" colSpan={5}>
                    Sin intentos registrados para este filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

