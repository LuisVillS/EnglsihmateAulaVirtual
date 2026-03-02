import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import SessionFlashcardsEditor from "@/components/session-flashcards-editor";
import {
  buildFlashcardLibraryMap,
  mapLibraryFlashcardRow,
  resolveAssignedFlashcardRow,
} from "@/lib/flashcards";
import { getSignedDownloadUrl } from "@/lib/r2";

export const metadata = {
  title: "Editar flashcards | Plantilla",
};

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const columnMatch = message.match(/column\s+"?([^"\s]+)"?\s+does not exist/i);
  if (columnMatch?.[1]) return columnMatch[1];
  return null;
}

async function resolveFlashcardAudioUrl(row) {
  const r2Key = String(row?.audio_r2_key || "").trim();
  if (r2Key) {
    try {
      return await getSignedDownloadUrl(r2Key);
    } catch {
      // fall through
    }
  }
  return String(row?.audio_url || "").trim() || null;
}

export default async function TemplateSessionFlashcardsPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const templateId = params?.id?.toString();
  const templateSessionId = params?.sessionId?.toString();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!adminRecord?.id) redirect("/admin/login");

  const { data: template } = await supabase
    .from("course_templates")
    .select("id, course_level, frequency, template_name")
    .eq("id", templateId)
    .maybeSingle();
  if (!template?.id) redirect("/admin/courses/templates");

  const { data: session } = await supabase
    .from("template_sessions")
    .select("id, template_id, month_index, session_in_month, session_in_cycle, title")
    .eq("id", templateSessionId)
    .eq("template_id", template.id)
    .maybeSingle();
  if (!session?.id) redirect(`/admin/courses/templates/${template.id}`);

  let initialTitle = "Flashcards";
  const { data: flashcardsItem } = await supabase
    .from("template_session_items")
    .select("id, title")
    .eq("template_session_id", session.id)
    .eq("type", "flashcards")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (flashcardsItem?.title) {
    initialTitle = flashcardsItem.title;
  }

  let initialCards = [];
  let flashcardsError = "";
  let flashcardColumns = ["id", "flashcard_id", "word", "meaning", "image_url", "card_order", "accepted_answers"];
  let flashcardsResult = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase
      .from("template_session_flashcards")
      .select(flashcardColumns.join(","))
      .eq("template_session_id", session.id)
      .order("card_order", { ascending: true })
      .order("created_at", { ascending: true });
    flashcardsResult = result;
    if (!result.error) break;
    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !flashcardColumns.includes(missingColumn)) break;
    flashcardColumns = flashcardColumns.filter((column) => column !== missingColumn);
  }

  if (flashcardsResult?.error) {
    const missingTable = getMissingTableName(flashcardsResult.error);
    if (missingTable?.endsWith("template_session_flashcards")) {
      flashcardsError = "Falta crear la tabla template_session_flashcards. Ejecuta el SQL actualizado antes de guardar.";
    } else {
      flashcardsError = flashcardsResult.error.message || "No se pudieron cargar las flashcards de la plantilla.";
    }
  } else {
    const flashcardIds = Array.from(
      new Set(
        (flashcardsResult?.data || [])
          .map((row) => String(row?.flashcard_id || "").trim())
          .filter(Boolean)
      )
    );
    let flashcardsById = new Map();
    if (flashcardIds.length) {
      const libraryResult = await supabase
        .from("flashcards")
        .select("id, word, meaning, image_url, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config")
        .in("id", flashcardIds);
      if (libraryResult.error) {
        flashcardsError = libraryResult.error.message || "No se pudo cargar la biblioteca de flashcards.";
      } else {
        const hydratedLibraryRows = await Promise.all(
          (libraryResult.data || []).map(async (row) => ({
            ...row,
            audio_url: await resolveFlashcardAudioUrl(row),
          }))
        );
        flashcardsById = buildFlashcardLibraryMap(hydratedLibraryRows);
      }
    }
    initialCards = (flashcardsResult.data || []).map((row, index) =>
      resolveAssignedFlashcardRow(row, flashcardsById, index + 1)
    );
  }

  let libraryCards = [];
  let libraryError = "";
  const libraryResult = await supabase
    .from("flashcards")
    .select("id, word, meaning, image_url, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config")
    .order("word", { ascending: true })
    .order("created_at", { ascending: true });
  if (libraryResult.error) {
    const missingTable = getMissingTableName(libraryResult.error);
    libraryError = missingTable?.endsWith("flashcards")
      ? "Falta crear la tabla flashcards. Ejecuta el SQL actualizado de biblioteca central."
      : (libraryResult.error.message || "No se pudo cargar la biblioteca central.");
  } else {
    libraryCards = await Promise.all(
      (libraryResult.data || []).map(async (row) =>
        mapLibraryFlashcardRow({
          ...row,
          audio_url: await resolveFlashcardAudioUrl(row),
        })
      )
    );
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Admin / Plantillas / Clase</p>
            <h1 className="text-3xl font-semibold">Editor de flashcards</h1>
            <p className="text-sm text-muted">
              {template.template_name || `${template.course_level} - ${template.frequency}`} - {session.title || "Clase sin titulo"}
            </p>
          </div>
          <Link
            href={`/admin/courses/templates/${template.id}`}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Volver a plantilla
          </Link>
        </header>

        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Clase</p>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Mes</p>
              <p className="font-semibold">{session.month_index || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Clase del mes</p>
              <p className="font-semibold">{session.session_in_month || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Indice global</p>
              <p className="font-semibold">{session.session_in_cycle || "-"}</p>
            </div>
          </div>
        </div>

        {flashcardsError ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {flashcardsError}
          </div>
        ) : null}

        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Editor</p>
          <h2 className="mt-1 text-xl font-semibold">Define el set reutilizable por referencia</h2>
          <p className="mt-1 text-sm text-muted">
            Estas flashcards se asignan desde la biblioteca central y se reutilizan al regenerar comisiones.
          </p>
          <div className="mt-5">
            <SessionFlashcardsEditor
              scope="template"
              templateId={template.id}
              templateSessionId={session.id}
              initialTitle={initialTitle}
              initialCards={initialCards}
              libraryCards={libraryCards}
              libraryError={libraryError}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
