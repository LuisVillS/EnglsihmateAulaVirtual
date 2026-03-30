import { redirect } from "next/navigation";
import PracticeExercisesPage from "@/components/practice-exercises-page";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { loadPracticeHubData } from "@/lib/practice-hub";
import { normalizeStudentCefrLevel } from "@/lib/student-levels";
import { resolveStudentUiLanguage } from "@/lib/student-ui-language";
import { withSupabaseRequestTrace } from "@/lib/supabase-tracing";

export const metadata = {
  title: "Practice Exercises | Aula Virtual",
};

export default async function PracticeExercisesRoute() {
  return withSupabaseRequestTrace("page:/app/practice/exercises", async () => {
    const { supabase, user, isAdmin, role, profile: contextProfile } = await getRequestUserContext();
    const db = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;

    if (!user) {
      redirect("/");
    }

    if (isAdmin) {
      redirect("/admin");
    }

    if (role !== USER_ROLES.STUDENT) {
      redirect("/app/matricula?locked=1");
    }

    let profile = contextProfile || null;
    if (!profile?.id) {
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, course_level, xp_total, current_streak")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message || "No se pudo cargar el perfil del estudiante.");
      }
      profile = profileRow || null;
    }

    const practiceHub = await loadPracticeHubData(db, {
      userId: user.id,
      legacyXpTotal: profile?.xp_total || 0,
      courseLevel: profile?.course_level || "",
    });
    const language = resolveStudentUiLanguage({
      courseLevel: profile?.course_level || "",
      pathname: "/app/practice/exercises",
    });

    return (
      <PracticeExercisesPage
        language={language}
        student={{
          id: user.id,
          fullName: profile?.full_name || user.user_metadata?.full_name || user.email || "Student",
          courseLevel: profile?.course_level || "",
          cefrLevel: normalizeStudentCefrLevel(profile?.course_level || ""),
          currentStreak: Number(profile?.current_streak || 0) || 0,
        }}
        practiceHub={practiceHub}
      />
    );
  });
}
