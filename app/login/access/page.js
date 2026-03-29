import Link from "next/link";
import { redirect } from "next/navigation";
import PrivateLoginCard from "@/components/auth-form";
import { resolveAdminLandingPath } from "@/lib/crm/auth";
import { createSupabaseServerClient, getCurrentSession } from "@/lib/supabase-server";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

export const metadata = {
  title: "Acceso Alumno | EnglishMate",
};

export default async function StudentAccessPage({ searchParams }) {
  const session = await getCurrentSession();
  const user = session?.user || null;

  if (user) {
    const supabase = await createSupabaseServerClient();
    const landingPath = await resolveAdminLandingPath(supabase, user.id);
    if (landingPath) redirect(landingPath);
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

  const resolvedSearchParams = (await searchParams) || {};
  const initialError =
    resolvedSearchParams && typeof resolvedSearchParams.error === "string"
      ? decodeURIComponent(resolvedSearchParams.error)
      : null;
  const initialIdentifier =
    resolvedSearchParams && typeof resolvedSearchParams.code === "string"
      ? decodeURIComponent(resolvedSearchParams.code)
      : "";
  const requireOtp =
    resolvedSearchParams && typeof resolvedSearchParams.otp === "string"
      ? ["1", "true", "yes"].includes(resolvedSearchParams.otp.toLowerCase())
      : false;

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-surface to-surface-2" />
      <div className="absolute left-6 top-6 z-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-primary/60 hover:text-foreground"
        >
          <span aria-hidden>{"<"}</span>
          Volver
        </Link>
      </div>
      <div className="relative w-full max-w-2xl">
        <PrivateLoginCard
          context="student"
          initialError={initialError}
          initialIdentifier={initialIdentifier}
          requireOtp={requireOtp}
          copyOverrides={{
            badge: "Portal alumnos",
            title: {
              email: "Accede con codigo o correo",
              login: "Ingresa al aula",
              set_password: "Crea tu contrasena",
            },
            description: {
              email: "Este acceso funciona para alumnos y no matriculados.",
            },
          }}
        />
      </div>
    </section>
  );
}
