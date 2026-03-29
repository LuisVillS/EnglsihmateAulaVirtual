import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAdminLandingPath } from "@/lib/crm/auth";
import { createSupabaseServerClient, getCurrentSession } from "@/lib/supabase-server";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

function normalizeErrorMessage(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return "";
  try {
    return decodeURIComponent(rawValue).trim();
  } catch {
    return rawValue.trim();
  }
}

export default async function HomePage({ searchParams }) {
  const resolvedSearchParams = (await searchParams) || {};
  const errorMessage = normalizeErrorMessage(
    typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : ""
  );

  const session = await getCurrentSession();
  const user = session?.user || null;

  if (!user) {
    if (errorMessage) {
      return (
        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16 text-foreground">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-surface to-surface-2" />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border border-border bg-surface p-8 shadow-2xl">
            <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-danger/10 text-danger">
              !
            </div>
            <h1 className="text-2xl font-semibold">No pudimos iniciar sesion</h1>
            <p className="mt-3 text-sm text-muted">{errorMessage}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
              >
                Ir a ingreso
              </Link>
              <Link
                href="/account/register"
                className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/60 hover:bg-surface-2"
              >
                Registrarme
              </Link>
            </div>
          </div>
        </section>
      );
    }
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const landingPath = await resolveAdminLandingPath(supabase, user.id);
  if (landingPath) {
    redirect(landingPath);
  }

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
