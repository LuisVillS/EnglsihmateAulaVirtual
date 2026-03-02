import { redirect } from "next/navigation";
import MatriculaPage from "@/app/matricula/page";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isUserInPreEnrollmentFlow } from "@/lib/pre-enrollment-routing";

export const metadata = {
  title: "Checkout de Pre-matricula | Aula Virtual",
};

export default async function PreMatriculaCheckoutPage() {
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

  if (!(await isUserInPreEnrollmentFlow(supabase, user.id, profile?.status || null))) {
    redirect("/app");
  }

  return <MatriculaPage />;
}
