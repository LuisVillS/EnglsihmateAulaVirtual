import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentSession } from "@/lib/supabase-server";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

export const metadata = {
  title: "Login | EnglishMate",
};

export default async function LoginLandingPage() {
  const session = await getCurrentSession();
  const user = session?.user || null;

  if (user) {
    const supabase = await createSupabaseServerClient();
    const { data: adminRecord } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (adminRecord?.id) redirect("/admin");
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    const effectiveRole = resolveProfileRole({ role: profile?.role, status: profile?.status });
    if (effectiveRole === USER_ROLES.NON_STUDENT) {
      redirect("/app/matricula");
    }
    redirect("/app");
  }

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-surface to-surface-2" />
      <div className="relative w-full max-w-3xl rounded-3xl border border-border bg-surface p-8 shadow-2xl">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-muted">EnglishMate</p>
          <h1 className="text-3xl font-semibold text-foreground">Bienvenido</h1>
          <p className="text-sm text-muted">Elige el tipo de acceso para continuar.</p>
        </header>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link
            href="/login/access"
            className="rounded-2xl border border-border bg-surface-2 p-6 text-left transition hover:border-primary/60 hover:bg-primary/10"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Portal alumnos</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">Soy alumno</h2>
            <p className="mt-2 text-sm text-muted">Ingresa con codigo/correo y contrasena.</p>
          </Link>
          <Link
            href="/account/register"
            className="rounded-2xl border border-border bg-surface-2 p-6 text-left transition hover:border-primary/60 hover:bg-primary/10"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Pre-matricula</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">Aun no soy alumno</h2>
            <p className="mt-2 text-sm text-muted">Registra tus datos y completa matricula.</p>
          </Link>
        </div>
      </div>
    </section>
  );
}
