import { redirect } from "next/navigation";
import PrivateLoginCard from "@/components/auth-form";
import { resolveAdminLandingPath } from "@/lib/crm/auth";
import { createSupabaseServerClient, getCurrentSession } from "@/lib/supabase-server";

export const metadata = {
  title: "Admin Login | EnglishMate",
};

export default async function AdminLoginPage({ searchParams }) {
  const session = await getCurrentSession();
  const user = session?.user || null;

  if (user) {
    const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
    const landingPath = await resolveAdminLandingPath(supabase, user.id);
    if (landingPath) redirect(landingPath);
    await supabase.auth.signOut();
  }

  const resolvedSearchParams = (await searchParams) || {};
  const initialError =
    resolvedSearchParams && typeof resolvedSearchParams.error === "string"
      ? decodeURIComponent(resolvedSearchParams.error)
      : null;

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-surface to-surface-2" />
      <div className="relative w-full max-w-2xl">
        <PrivateLoginCard context="admin" initialError={initialError} />
      </div>
    </section>
  );
}
