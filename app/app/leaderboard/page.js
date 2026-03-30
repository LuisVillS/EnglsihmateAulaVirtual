import { redirect } from "next/navigation";
import LeaderboardPage from "@/components/leaderboard-page";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { loadLeaderboardData } from "@/lib/training-hub";
import { resolveStudentUiLanguage } from "@/lib/student-ui-language";
import { withSupabaseRequestTrace } from "@/lib/supabase-tracing";

export const metadata = {
  title: "Leaderboard | Aula Virtual",
};

function normalizeLeaderboardView(searchParams) {
  const value = String(searchParams?.view || "").trim().toLowerCase();
  return ["weekly", "practice", "flashcards"].includes(value) ? value : "weekly";
}

export default async function LeaderboardRoute({ searchParams: searchParamsPromise }) {
  return withSupabaseRequestTrace("page:/app/leaderboard", async () => {
    const searchParams = await searchParamsPromise;
    const initialView = normalizeLeaderboardView(searchParams);
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
    if (!profile?.id || profile?.current_streak == null) {
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

    const competition = await loadLeaderboardData(db, {
      userId: user.id,
      legacyXpTotal: profile?.xp_total || 0,
    });
    const language = resolveStudentUiLanguage({ courseLevel: profile?.course_level || "", pathname: "/app/leaderboard" });

    return (
      <LeaderboardPage
        student={{
          id: user.id,
          fullName: profile?.full_name || user.user_metadata?.full_name || user.email || "Student",
          courseLevel: profile?.course_level || "",
          currentStreak: Number(profile?.current_streak || 0) || 0,
        }}
        language={language}
        competition={competition}
        initialView={initialView}
      />
    );
  });
}
