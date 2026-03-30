import { redirect } from "next/navigation";
import TrainingHubPage from "@/components/training-hub-page";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { buildWeaknessDeckKey } from "@/lib/flashcard-arcade/constants";
import { loadTrainingHubData } from "@/lib/training-hub";
import { normalizeStudentCefrLevel } from "@/lib/student-levels";
import { resolveStudentUiLanguage } from "@/lib/student-ui-language";
import { withSupabaseRequestTrace } from "@/lib/supabase-tracing";

export const metadata = {
  title: "Let's Practice | Aula Virtual",
};

function normalizeSearchParams(searchParams) {
  const directIds = Array.isArray(searchParams?.exercise_id)
    ? searchParams.exercise_id
    : searchParams?.exercise_id
    ? [searchParams.exercise_id]
    : [];
  const csvIds = String(searchParams?.exercise_ids || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const rawTab = String(searchParams?.tab || "").trim().toLowerCase();
  const requestedDeck = String(searchParams?.deck || searchParams?.deck_key || searchParams?.deckKey || "").trim();
  const rawFlashcardMode = String(searchParams?.flashcard_mode || searchParams?.flashcardMode || "").trim().toLowerCase();
  const rawMode = String(searchParams?.mode || "").trim().toLowerCase();
  const normalizedTab = ["overview", "exercises", "flashcards", "this-week"].includes(rawTab)
    ? rawTab
    : requestedDeck || rawFlashcardMode
    ? "flashcards"
    : rawMode || directIds.length || csvIds.length
    ? "exercises"
    : "overview";

  const normalizedDeckKey = requestedDeck === "weak-cards" ? buildWeaknessDeckKey("assigned") : requestedDeck;

  return {
    tab: normalizedTab,
    mode: normalizedTab === "exercises" ? rawMode : "",
    skill: String(searchParams?.skill || "").trim().toLowerCase(),
    cefrLevel: String(searchParams?.cefr || searchParams?.cefrLevel || "").trim().toUpperCase(),
    categoryId: String(searchParams?.category_id || searchParams?.categoryId || "").trim(),
    scenario: String(searchParams?.scenario || "").trim().toLowerCase(),
    exerciseIds: Array.from(new Set([...directIds, ...csvIds].map((value) => String(value || "").trim()).filter(Boolean))),
    flashcards: {
      deckKey: normalizedTab === "flashcards" ? normalizedDeckKey : "",
      mode: normalizedTab === "flashcards" ? (rawFlashcardMode || rawMode) : "",
    },
  };
}

export default async function PracticePage({ searchParams: searchParamsPromise }) {
  return withSupabaseRequestTrace("page:/app/practice", async () => {
    const searchParams = await searchParamsPromise;
    const initialParams = normalizeSearchParams(searchParams);
    if (initialParams.tab === "flashcards") {
      const nextParams = new URLSearchParams();
      if (initialParams.flashcards?.deckKey) nextParams.set("deck", initialParams.flashcards.deckKey);
      if (initialParams.flashcards?.mode) nextParams.set("mode", initialParams.flashcards.mode);
      redirect(nextParams.toString() ? `/app/practice/decks?${nextParams.toString()}` : "/app/practice/decks");
    }
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

    const hubData = await loadTrainingHubData(db, {
      userId: user.id,
      legacyXpTotal: profile?.xp_total || 0,
      courseLevel: profile?.course_level || "",
    });
    const language = resolveStudentUiLanguage({ courseLevel: profile?.course_level || "", pathname: "/app/practice" });

    return (
      <TrainingHubPage
        student={{
          id: user.id,
          fullName: profile?.full_name || user.user_metadata?.full_name || user.email || "Student",
          courseLevel: profile?.course_level || "",
          cefrLevel: normalizeStudentCefrLevel(profile?.course_level || ""),
        }}
        language={language}
        hubData={hubData}
        initialParams={initialParams}
      />
    );
  });
}
