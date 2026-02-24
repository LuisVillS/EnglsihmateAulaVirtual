"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  DEMO_COURSE_ID,
  DEMO_UNIT_ID,
  DEMO_LESSON_ID,
  DEMO_EXERCISE_IDS,
} from "@/lib/demo-seed-ids";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No autenticado");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    throw new Error("Solo admins");
  }

  return supabase;
}

export async function seedDemoData() {
  const supabase = await requireAdmin();

  await supabase.from("courses").upsert(
    [
      {
        id: DEMO_COURSE_ID,
        slug: "a1-demo",
        title: "Curso Demo A1",
        level: "A1",
        description: "Saludando y presentándote en situaciones básicas.",
        start_date: "2026-01-01",
        end_date: "2026-04-01",
        duration_months: 3,
        duration_weeks: 12,
        modality_key: "DAILY",
        days_of_week: [1, 2, 3, 4, 5],
        start_time: "09:00",
        end_time: "10:30",
      },
    ],
    { onConflict: "id" }
  );

  await supabase.from("units").upsert(
    [
      {
        id: DEMO_UNIT_ID,
        course_id: DEMO_COURSE_ID,
        title: "Unidad 1 · Saludos",
        position: 1,
      },
    ],
    { onConflict: "id" }
  );

  await supabase.from("lessons").upsert(
    [
      {
        id: DEMO_LESSON_ID,
        unit_id: DEMO_UNIT_ID,
        title: "Saludos básicos",
        description: "Aprende a saludar y despedirte de forma natural.",
        position: 1,
      },
    ],
    { onConflict: "id" }
  );

  await supabase.from("exercises").upsert(
    [
      {
        id: DEMO_EXERCISE_IDS[0],
        lesson_id: DEMO_LESSON_ID,
        kind: "listening",
        prompt: "Escucha el audio y elige el saludo correcto.",
        payload: {
          audio_url: "https://cdn.example.com/audios/greeting-demo.mp3",
          choices: ["Good morning", "Good night", "See you"],
          answer: "Good morning",
        },
        r2_key: null,
      },
      {
        id: DEMO_EXERCISE_IDS[1],
        lesson_id: DEMO_LESSON_ID,
        kind: "speaking",
        prompt: "Pronuncia tu saludo favorito.",
        payload: {
          audio_url: null,
          choices: [],
          answer: "Hi there!",
        },
        r2_key: "audios/demo-saludo.webm",
      },
    ],
    { onConflict: "id" }
  );

  revalidatePath("/admin");
  revalidatePath(`/lesson/${DEMO_LESSON_ID}`);

  return { lessonId: DEMO_LESSON_ID };
}
