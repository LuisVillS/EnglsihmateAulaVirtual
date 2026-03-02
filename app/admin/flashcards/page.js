import Link from "next/link";
import { redirect } from "next/navigation";
import FlashcardsLibraryManager from "@/components/flashcards-library-manager";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { mapLibraryFlashcardRow } from "@/lib/flashcards";
import { getSignedDownloadUrl } from "@/lib/r2";

export const metadata = {
  title: "Flashcards Library | Admin",
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
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Flashcards</p>
            <h1 className="text-3xl font-semibold">Flashcards Library</h1>
            <p className="text-sm text-muted">
              Biblioteca central reutilizable para plantillas, comisiones y clases.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Panel
            </Link>
            <Link
              href="/admin/courses/templates"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Plantillas
            </Link>
            <Link
              href="/admin/commissions"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Comisiones
            </Link>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <FlashcardsLibraryManager initialCards={cards} />
      </div>
    </section>
  );
}
