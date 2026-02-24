import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isUserInPreEnrollmentFlow } from "@/lib/pre-enrollment-routing";

export const metadata = {
  title: "Aula de Pre-matricula | Aula Virtual",
};

export default async function PreMatriculaDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!(await isUserInPreEnrollmentFlow(supabase, user.id, profile?.status || null))) {
    redirect("/app");
  }

  return (
    <section className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Aula de pre-matricula</p>
          <h1 className="text-3xl font-semibold">Hola {profile?.full_name || "Alumno"}</h1>
          <p className="text-sm text-muted">Completa tu proceso para convertirte en alumno matriculado.</p>
        </header>
        <Link
          href="/matricula"
          className="group block rounded-3xl border border-border bg-surface p-10 transition hover:border-primary hover:bg-surface-2"
        >
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Opcion principal</p>
          <h2 className="mt-4 text-4xl font-semibold">Matricula</h2>
          <p className="mt-3 text-sm text-muted">Selecciona tu plan, acepta terminos y sube comprobante de pago.</p>
        </Link>
      </div>
    </section>
  );
}
