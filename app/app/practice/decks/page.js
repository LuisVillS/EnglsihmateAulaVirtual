import { redirect } from "next/navigation";
import PracticeDecksPage from "@/components/practice-decks-page";
import { buildWeaknessDeckKey, normalizeFlashcardGameMode } from "@/lib/flashcard-arcade/constants";
import { loadFlashcardArcadeHubData } from "@/lib/flashcard-arcade/service";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { normalizeStudentCefrLevel } from "@/lib/student-levels";
import { resolveStudentUiLanguage } from "@/lib/student-ui-language";
import { withSupabaseRequestTrace } from "@/lib/supabase-tracing";

export const metadata = {
  title: "Deck Library | Aula Virtual",
};

function normalizeDeckParams(searchParams) {
  const rawDeck = String(searchParams?.deck || searchParams?.deck_key || searchParams?.deckKey || "").trim();
  const rawMode = String(searchParams?.mode || searchParams?.flashcard_mode || searchParams?.flashcardMode || "").trim();
  return {
    deckKey: rawDeck === "weak-cards" ? buildWeaknessDeckKey("assigned") : rawDeck,
    mode: rawMode ? normalizeFlashcardGameMode(rawMode) : "",
  };
}

export default async function PracticeDecksRoute({ searchParams: searchParamsPromise }) {
  return withSupabaseRequestTrace("page:/app/practice/decks", async () => {
    const searchParams = await searchParamsPromise;
    const initialParams = normalizeDeckParams(searchParams);
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
        .select("id, full_name, course_level, xp_total")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message || "No se pudo cargar el perfil del estudiante.");
      }
      profile = profileRow || null;
    }

    const flashcardHub = await loadFlashcardArcadeHubData(db, {
      userId: user.id,
      legacyXpTotal: profile?.xp_total || 0,
      courseLevel: profile?.course_level || "",
    });
    const language = resolveStudentUiLanguage({
      courseLevel: profile?.course_level || "",
      pathname: "/app/practice/decks",
    });

    return (
      <PracticeDecksPage
        language={language}
        initialParams={initialParams}
        student={{
          id: user.id,
          fullName: profile?.full_name || user.user_metadata?.full_name || user.email || "Student",
          courseLevel: profile?.course_level || "",
          cefrLevel: normalizeStudentCefrLevel(profile?.course_level || ""),
        }}
        flashcardHub={flashcardHub}
      />
    );
  });
}
