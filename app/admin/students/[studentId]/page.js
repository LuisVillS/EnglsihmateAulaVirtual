import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import StudentForm from "@/components/student-form";
import AdminStudentPasswordForm from "@/components/admin-student-password-form";

function isMissingStudentGradeColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("student_grade") && message.includes("profiles");
}

function formatHourLabel(hour) {
  if (hour == null) return "Horario a coordinar";
  const hours = Math.floor(hour / 60)
    .toString()
    .padStart(2, "0");
  const minutes = hour % 60 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
}

export default async function StudentDetailPage({ params: paramsPromise }) {
  const params = await paramsPromise;
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

  const { studentId } = params;
  let student = null;
  let studentQuery = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, dni, phone, birth_date, student_code, course_level, is_premium, student_grade, start_month, enrollment_date, preferred_hour, commission_id, commission:course_commissions (id, course_level, commission_number, start_time, end_time, modality_key, days_of_week)"
    )
    .eq("id", studentId)
    .maybeSingle();
  if (studentQuery.error && isMissingStudentGradeColumnError(studentQuery.error)) {
    studentQuery = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, dni, phone, birth_date, student_code, course_level, is_premium, start_month, enrollment_date, preferred_hour, commission_id, commission:course_commissions (id, course_level, commission_number, start_time, end_time, modality_key, days_of_week)"
      )
      .eq("id", studentId)
      .maybeSingle();
    student = studentQuery.data
      ? {
          ...studentQuery.data,
          student_grade: null,
        }
      : null;
  } else {
    student = studentQuery.data || null;
  }

  if (!student) {
    notFound();
  }

  const { data: commissionsData } = await supabase
    .from("course_commissions")
    .select("id, course_level, commission_number, start_time, end_time, modality_key, days_of_week, is_active")
    .eq("is_active", true)
    .order("course_level", { ascending: true })
    .order("commission_number", { ascending: true });

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-12 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="rounded-[2.5rem] border border-border bg-surface p-8 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-muted">Perfil del alumno</p>
              <h1 className="mt-2 text-3xl font-semibold">{student.full_name || student.email}</h1>
              <p className="text-sm text-muted">{student.email}</p>
            </div>
            <div className="text-right text-sm text-muted">
              <p>
                Codigo: <span className="font-semibold text-foreground">{student.student_code || "N/A"}</span>
              </p>
              <p>
                Curso: <span className="font-semibold text-foreground">{student.course_level || "Sin curso"}</span>
              </p>
              <p>
                Horario: <span className="font-semibold text-foreground">{formatHourLabel(student.preferred_hour)}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
            <span
              className={`rounded-full border px-3 py-1 ${
                student.is_premium ? "border-accent/45 text-accent" : "border-border"
              }`}
            >
              {student.is_premium ? "Premium" : "Regular"}
            </span>
            {student.dni ? <span className="rounded-full border border-border px-3 py-1">DNI {student.dni}</span> : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href="/admin/students"
              className="rounded-full border border-border px-4 py-2 text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver al listado
            </Link>
            <p className="text-muted">
              Aqui podras ver y editar los datos del alumno. Proximamente se agregaran notas y progreso.
            </p>
          </div>
        </header>

        <StudentForm student={student} redirectTo="/admin/students" commissions={commissionsData || []} />
        <AdminStudentPasswordForm studentId={student.id} redirectTo={`/admin/students/${student.id}`} />
      </div>
    </section>
  );
}
