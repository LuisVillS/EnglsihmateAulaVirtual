import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminCard, AdminPage, AdminPageHeader } from "@/components/admin-page";
import FlashcardsLibraryManager from "@/components/flashcards-library-manager";
import { mapLibraryFlashcardRow } from "@/lib/flashcards";
import { getSignedDownloadUrl } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const metadata = {
  title: "Biblioteca de flashcards | Admin",
};

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

async function resolveFlashcardAudioUrl(row) {
  const r2Key = String(row?.audio_r2_key || "").trim();
  if (r2Key) {
    try {
      return await getSignedDownloadUrl(r2Key);
    } catch {
      // fall through to stored URL
    }
  }
  return String(row?.audio_url || "").trim() || null;
}

export default async function AdminFlashcardsPage() {
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

  let cards = [];
  let errorMessage = "";

  const flashcardsResult = await supabase
    .from("flashcards")
    .select("id, word, meaning, image_url, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config")
    .order("word", { ascending: true })
    .order("created_at", { ascending: true });

  if (flashcardsResult.error) {
    const missingTable = getMissingTableName(flashcardsResult.error);
    errorMessage = missingTable?.endsWith("flashcards")
      ? "Falta crear la tabla flashcards. Ejecuta el SQL actualizado de biblioteca central."
      : (flashcardsResult.error.message || "No se pudo cargar la biblioteca de flashcards.");
  } else {
    cards = await Promise.all(
      (flashcardsResult.data || []).map(async (row) =>
        mapLibraryFlashcardRow({
          ...row,
          audio_url: await resolveFlashcardAudioUrl(row),
        })
      )
    );
  }

  return (
    <AdminPage className="mx-auto w-full max-w-7xl">
      <AdminPageHeader
        eyebrow="Contenido academico"
        title="Biblioteca de flashcards"
        description="Inventario central para clases, comisiones y plantillas con las mismas acciones de guardado, subida y audio."
        actions={
          <>
            <Link
              href="/admin/courses/templates"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Plantillas
            </Link>
            <Link
              href="/admin/commissions"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Comisiones
            </Link>
          </>
        }
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}

      <AdminCard className="p-4 sm:p-5">
        <FlashcardsLibraryManager initialCards={cards} />
      </AdminCard>
    </AdminPage>
  );
}
