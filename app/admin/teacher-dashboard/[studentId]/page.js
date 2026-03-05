import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import {
  closeStudentLevel,
  loadTeacherStudentProfile,
  setStudentAdminGrade,
  setStudentSpeakingOverride,
} from "@/lib/student-skills";

export const metadata = {
  title: "Perfil alumno | Teacher Dashboard",
};

const SKILL_KEYS = ["speaking", "reading", "grammar", "listening", "vocabulary"];
const SKILL_LABELS = {
  speaking: "Speaking",
  reading: "Reading",
  grammar: "Grammar",
  listening: "Listening",
  vocabulary: "Vocabulary",
};

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

function formatScore(value) {
  const score = clampScore(value);
  if (score == null) return "--";
  return `${Math.round(score)}%`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getFlashMessage(searchParams) {
  const saved = cleanText(searchParams?.saved).toLowerCase();
  const error = cleanText(searchParams?.error);

  if (error) {
    return { type: "error", text: error };
  }
  if (saved === "grade") {
    return { type: "success", text: "Nota guardada" };
  }
  if (saved === "speaking") {
    return { type: "success", text: "Speaking actualizado correctamente." };
  }
  if (saved === "close-level") {
    return { type: "success", text: "Nivel cerrado y snapshot guardado." };
  }
  return null;
}

function Sparkline({ data = [] }) {
  const items = (data || []).slice(-8);
  if (!items.length) {
    return <p className="text-sm text-muted">Sin datos de evolución todavía.</p>;
  }

  return (
    <div className="mt-3 grid grid-cols-8 gap-2">
      {items.map((item, idx) => {
        const score = clampScore(item.score) ?? 0;
        const height = Math.max(6, Math.round((score / 100) * 72));
        return (
          <div key={`${item.label}-${idx}`} className="flex flex-col items-center gap-1">
            <div className="flex h-20 w-full items-end rounded-lg bg-surface-2 px-1">
              <div
                className="w-full rounded-md bg-primary transition-all duration-300"
                style={{ height: `${height}px` }}
                title={`${item.label}: ${score}%`}
              />
            </div>
            <span className="line-clamp-1 text-[10px] text-muted">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SkillBar({ label, value }) {
  const width = clampScore(value) ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-semibold text-foreground">{formatScore(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

async function requireAdminDb() {
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
  return { db, user };
}

export default async function TeacherStudentProfilePage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};
  const studentId = params?.studentId?.toString();
  if (!studentId) {
    redirect("/admin/teacher-dashboard");
  }

  const { db } = await requireAdminDb();
  const profileData = await loadTeacherStudentProfile({ db, studentId });
  const flash = getFlashMessage(searchParams);

  async function updateGradeAction(formData) {
    "use server";
    try {
      const { db: actionDb, user: actionUser } = await requireAdminDb();
      await setStudentAdminGrade({
        db: actionDb,
        actorId: actionUser?.id || null,
        userId: studentId,
        level: cleanText(formData.get("level")),
        adminGrade: formData.get("adminGrade"),
        comment: cleanText(formData.get("comment")),
      });
      revalidatePath("/admin/teacher-dashboard");
      revalidatePath(`/admin/teacher-dashboard/${studentId}`);
      revalidatePath("/app");
    } catch (error) {
      const message = encodeURIComponent(error?.message || "No se pudo actualizar nota.");
      redirect(`/admin/teacher-dashboard/${studentId}?error=${message}`);
    }
    redirect(`/admin/teacher-dashboard/${studentId}?saved=grade`);
  }

  async function updateSpeakingAction(formData) {
    "use server";
    try {
      const { db: actionDb, user: actionUser } = await requireAdminDb();
      await setStudentSpeakingOverride({
        db: actionDb,
        actorId: actionUser?.id || null,
        userId: studentId,
        level: cleanText(formData.get("level")),
        speakingValue: formData.get("speakingValue"),
      });
      revalidatePath("/admin/teacher-dashboard");
      revalidatePath(`/admin/teacher-dashboard/${studentId}`);
      revalidatePath("/app");
    } catch (error) {
      const message = encodeURIComponent(error?.message || "No se pudo actualizar speaking.");
      redirect(`/admin/teacher-dashboard/${studentId}?error=${message}`);
    }
    redirect(`/admin/teacher-dashboard/${studentId}?saved=speaking`);
  }

  async function closeLevelAction(formData) {
    "use server";
    try {
      const { db: actionDb, user: actionUser } = await requireAdminDb();
      await closeStudentLevel({
        db: actionDb,
        actorId: actionUser?.id || null,
        userId: studentId,
        level: cleanText(formData.get("level")),
        startedAt: cleanText(formData.get("startedAt")) || null,
        completedAt: cleanText(formData.get("completedAt")) || null,
        notes: cleanText(formData.get("notes")),
      });
      revalidatePath("/admin/teacher-dashboard");
      revalidatePath(`/admin/teacher-dashboard/${studentId}`);
      revalidatePath("/app");
    } catch (error) {
      const message = encodeURIComponent(error?.message || "No se pudo cerrar nivel.");
      redirect(`/admin/teacher-dashboard/${studentId}?error=${message}`);
    }
    redirect(`/admin/teacher-dashboard/${studentId}?saved=close-level`);
  }

  const student = profileData.student;
  const skills = profileData.skills;
  const tests = profileData.tests || [];
  const history = profileData.history || [];

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8 text-foreground">
      <header className="rounded-3xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin/teacher-dashboard" className="text-xs font-semibold uppercase tracking-[0.24em] text-muted hover:text-foreground">
              Volver al dashboard
            </Link>
            <h1 className="mt-2 text-3xl font-semibold">{student.full_name}</h1>
            <p className="mt-1 text-sm text-muted">
              {student.student_code || "Sin código"} - {student.commission_label || "Sin comisión"} - Nivel {student.current_level || "--"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-[0.22em] text-muted">Estado</p>
            <p className="font-semibold">{student.status === "active" ? "Activo" : "Inactivo"}</p>
          </div>
        </div>
      </header>

      {flash ? (
        <p
          className={`rounded-2xl border px-4 py-2 text-sm ${
            flash.type === "error"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-success/40 bg-success/10 text-success"
          }`}
        >
          {flash.text}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Habilidades</p>
          <h2 className="mt-1 text-xl font-semibold">Speaking / Reading / Grammar / Listening / Vocabulary</h2>
          <div className="mt-4 space-y-4">
            {SKILL_KEYS.map((key) => (
              <SkillBar key={key} label={SKILL_LABELS[key]} value={skills?.combined?.[key]} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Cálculo mostrado: 50% histórico de niveles previos + 50% nivel actual.
          </p>
        </article>

        <article className="space-y-4">
          <form action={updateSpeakingAction} className="rounded-3xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Speaking manual</p>
            <h3 className="mt-1 text-lg font-semibold">Actualizar speaking del nivel actual</h3>
            <input type="hidden" name="level" value={student.current_level || ""} />
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                name="speakingValue"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={skills?.current?.speaking ?? ""}
                required
                className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              />
              <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Guardar speaking
              </button>
            </div>
          </form>

          <form action={updateGradeAction} className="rounded-3xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Nota actual</p>
            <h3 className="mt-1 text-lg font-semibold">Editar nota admin del alumno</h3>
            <input type="hidden" name="level" value={student.current_level || ""} />
            <div className="mt-3 space-y-3">
              <input
                name="adminGrade"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={student.admin_grade ?? student.current_grade ?? ""}
                required
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              />
              <textarea
                name="comment"
                rows={2}
                defaultValue={student.current_grade_comment || ""}
                placeholder="Comentario opcional"
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              />
              <button type="submit" className="w-full rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary">
                Guardar nota
              </button>
            </div>
          </form>
        </article>
      </div>

      <article className="rounded-3xl border border-border bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Pruebas realizadas</p>
        <h2 className="mt-1 text-xl font-semibold">Resumen del nivel actual</h2>
        <Sparkline data={profileData.test_evolution || []} />

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm md:min-w-[680px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Prueba</th>
                <th className="px-2 py-2">Score</th>
                <th className="px-2 py-2">Intentos usados</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id} className="border-t border-border/60">
                  <td className="px-2 py-2">{formatDateTime(test.completed_at)}</td>
                  <td className="px-2 py-2">{test.lesson_title}</td>
                  <td className="px-2 py-2 font-semibold">{formatScore(test.score)}</td>
                  <td className="px-2 py-2">{test.attempts_used}</td>
                </tr>
              ))}
              {!tests.length ? (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-muted">
                    No hay pruebas completadas para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Notas pasadas</p>
            <h2 className="mt-1 text-xl font-semibold">Historial por nivel</h2>
          </div>
          <form action={closeLevelAction} className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface-2 p-3 sm:w-auto">
            <input type="hidden" name="level" value={student.current_level || ""} />
            <input name="startedAt" type="datetime-local" className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground" />
            <textarea
              name="notes"
              rows={2}
              placeholder="Notas de cierre (opcional)"
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
            />
            <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              Cerrar nivel actual
            </button>
          </form>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm md:min-w-[980px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-2 py-2">Nivel</th>
                <th className="px-2 py-2">Inicio</th>
                <th className="px-2 py-2">Cierre</th>
                <th className="px-2 py-2">Nota final</th>
                <th className="px-2 py-2">Speaking</th>
                <th className="px-2 py-2">Reading</th>
                <th className="px-2 py-2">Grammar</th>
                <th className="px-2 py-2">Listening</th>
                <th className="px-2 py-2">Vocabulary</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id || `${row.user_id}-${row.level}`} className="border-t border-border/60">
                  <td className="px-2 py-2 font-semibold">{row.level || "--"}</td>
                  <td className="px-2 py-2">{formatDate(row.started_at)}</td>
                  <td className="px-2 py-2">{formatDate(row.completed_at)}</td>
                  <td className="px-2 py-2">{formatScore(row.final_grade_0_100)}</td>
                  <td className="px-2 py-2">{formatScore(row.final_speaking_0_100)}</td>
                  <td className="px-2 py-2">{formatScore(row.final_reading_0_100)}</td>
                  <td className="px-2 py-2">{formatScore(row.final_grammar_0_100)}</td>
                  <td className="px-2 py-2">{formatScore(row.final_listening_0_100)}</td>
                  <td className="px-2 py-2">{formatScore(row.final_vocabulary_0_100)}</td>
                </tr>
              ))}
              {!history.length ? (
                <tr>
                  <td colSpan={9} className="px-2 py-6 text-center text-muted">
                    Aún no hay snapshots de niveles cerrados.
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
