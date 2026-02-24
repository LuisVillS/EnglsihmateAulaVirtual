import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { seedDemoData } from "./actions";
import { DEMO_LESSON_ID } from "@/lib/demo-seed-ids";

export default async function SeedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    redirect("/");
  }

  const { data: lessonExists } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", DEMO_LESSON_ID)
    .maybeSingle();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Seed de demo A1</h1>
        <p className="text-sm text-muted">
          Genera un curso completo (curso, unidad, lección y ejercicios) con audios de prueba.
        </p>
      </div>
      <form action={seedDemoData} className="space-y-3 rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          Esta acción es idempotente. Si ya existe la demo, se actualizarán los registros.
        </p>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition hover:bg-primary-2"
        >
          Crear / refrescar datos demo
        </button>
      </form>
      {lessonExists ? (
        <div className="rounded-xl border border-success/40 bg-success/10 p-4 text-sm text-success">
          Demo lista. Visita {" "}
          <Link href={`/lesson/${DEMO_LESSON_ID}`} className="font-semibold underline">
            esta lección
          </Link>{" "}
          para probar el reproductor.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          Aún no se ha generado la demo.
        </div>
      )}
    </section>
  );
}
