import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import TemplateForm from "../template-form";

export const metadata = {
  title: "Nueva plantilla | Admin",
};

export default async function NewCourseTemplatePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!adminRecord?.id) redirect("/admin/login");

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Plantillas</p>
            <h1 className="text-3xl font-semibold">Crear plantilla</h1>
            <p className="text-sm text-muted">Crea una plantilla unica por nivel + frecuencia.</p>
          </div>
          <Link
            href="/admin/courses/templates"
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Volver
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <TemplateForm redirectOnSuccess />
        </div>
      </div>
    </section>
  );
}
