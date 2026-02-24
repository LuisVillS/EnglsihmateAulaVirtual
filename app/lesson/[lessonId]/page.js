import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSignedDownloadUrl } from "@/lib/r2";

async function fetchLesson(lessonId) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(
      `
      id,
      title,
      description,
      unit:units (
        id,
        title,
        course:courses (
          id,
          title,
          level
        )
      ),
      exercises (
        id,
        kind,
        prompt,
        payload,
        r2_key
      )
    `
    )
    .eq("id", lessonId)
    .single();

  if (error || !data) {
    return null;
  }

  const exercises = await Promise.all(
    (data.exercises || []).map(async (exercise) => {
      const payload = exercise.payload || {};
      if (payload.audio_url) {
        return { ...exercise, audioSource: payload.audio_url };
      }

      if (exercise.r2_key) {
        try {
          const signed = await getSignedDownloadUrl(exercise.r2_key);
          return { ...exercise, audioSource: signed };
        } catch {
          return { ...exercise, audioSource: null };
        }
      }

      return { ...exercise, audioSource: null };
    })
  );

  return { ...data, exercises };
}

export default async function LessonPage({ params }) {
  const lesson = await fetchLesson(params.lessonId);

  if (!lesson) {
    notFound();
  }

  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-xs uppercase tracking-wide text-muted">
          {lesson.unit?.course?.title} · {lesson.unit?.course?.level}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">{lesson.title}</h1>
        <p className="mt-2 text-sm text-muted">{lesson.description}</p>
      </div>
      <div className="space-y-6">
        {lesson.exercises?.map((exercise, index) => (
          <article key={exercise.id} className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Ejercicio {index + 1} · {exercise.kind}
              </span>
              {exercise.audioSource ? (
                <audio controls src={exercise.audioSource} className="w-full md:w-64" />
              ) : null}
            </div>
            <p className="mt-3 text-lg font-semibold text-foreground">{exercise.prompt}</p>
            {exercise.payload?.choices?.length ? (
              <ul className="mt-3 space-y-2 text-sm text-foreground">
                {exercise.payload.choices.map((choice) => (
                  <li key={choice} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                    {choice}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm text-muted">
              Respuesta esperada: <strong>{exercise.payload?.answer}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
