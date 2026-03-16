import { redirect } from "next/navigation";
import CompetitionHub from "@/components/competition-hub";
import { loadCompetitionHubData } from "@/lib/competition/service";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";

export const metadata = {
  title: "Weekly Competition | Aula Virtual",
};

export default async function CompetitionPage() {
  const { supabase, user, isAdmin, role } = await getRequestUserContext();

  if (!user) {
    redirect("/");
  }

  if (isAdmin) {
    redirect("/admin");
  }

  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, course_level, xp_total")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message || "No se pudo cargar el perfil del estudiante.");
  }

  const competition = await loadCompetitionHubData(supabase, {
    userId: user.id,
    legacyXpTotal: profile?.xp_total || 0,
  });

  return (
    <CompetitionHub
      student={{
        id: user.id,
        fullName: profile?.full_name || user.user_metadata?.full_name || user.email || "Student",
        courseLevel: profile?.course_level || "",
      }}
      competition={competition}
    />
  );
}

