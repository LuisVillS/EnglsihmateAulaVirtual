import { redirect } from "next/navigation";
import PracticeArena from "@/components/practice-arena";
import { loadPracticeHubData } from "@/lib/practice-hub";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

export const metadata = {
  title: "Practice Arena | Aula Virtual",
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

  return {
    mode: String(searchParams?.mode || "").trim().toLowerCase(),
    skill: String(searchParams?.skill || "").trim().toLowerCase(),
    cefrLevel: String(searchParams?.cefr || searchParams?.cefrLevel || "").trim().toUpperCase(),
    categoryId: String(searchParams?.category_id || searchParams?.categoryId || "").trim(),
    scenario: String(searchParams?.scenario || "").trim().toLowerCase(),
    exerciseIds: Array.from(new Set([...directIds, ...csvIds].map((value) => String(value || "").trim()).filter(Boolean))),
  };
}

export default async function PracticePage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const initialParams = normalizeSearchParams(searchParams);
  const { supabase, user, isAdmin, role } = await getRequestUserContext();
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, course_level, xp_total")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message || "No se pudo cargar el perfil del estudiante.");
  }

  const hubData = await loadPracticeHubData(db, {
    userId: user.id,
    legacyXpTotal: profile?.xp_total || 0,
  });

  return (
    <PracticeArena
      initialStudent={{
        id: user.id,
        fullName: profile?.full_name || user.user_metadata?.full_name || user.email || "Student",
        courseLevel: profile?.course_level || "",
      }}
      initialHubData={hubData}
      initialParams={initialParams}
    />
  );
}
