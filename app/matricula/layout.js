import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isUserInPreEnrollmentFlow } from "@/lib/pre-enrollment-routing";

export default async function MatriculaLayout({ children }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  const canAccessMatricula = await isUserInPreEnrollmentFlow(supabase, user.id, profile?.status || null);
  if (!canAccessMatricula) {
    redirect("/app");
  }

  redirect("/prematricula");
}
