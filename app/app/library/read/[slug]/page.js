import { notFound } from "next/navigation";
import LibraryReaderShell from "@/components/library-reader-shell";
import { requireStudentLibraryPageAccess } from "@/lib/library/page-access";
import { getPublishedLibraryBookBySlug, listRelatedLibraryBooks } from "@/lib/library/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryReadPage({ params: paramsPromise }) {
  const { supabase, user } = await requireStudentLibraryPageAccess();
  const params = await paramsPromise;

  const book = await getPublishedLibraryBookBySlug({
    db: supabase,
    slug: params?.slug,
    userId: user.id,
  });

  if (!book?.id) {
    notFound();
  }

  const relatedBooks = await listRelatedLibraryBooks({
    db: supabase,
    book,
    userId: user.id,
    limit: 4,
  });

  return <LibraryReaderShell initialBook={book} initialRelatedBooks={relatedBooks} />;
}

