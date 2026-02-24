import { redirect } from "next/navigation";
import PrivateLoginCard from "@/components/auth-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const metadata = {
  title: "Admin Login | EnglishMate",
};

export default async function AdminLoginPage({ searchParams }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: adminRecord } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (adminRecord?.id) redirect("/admin");
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
