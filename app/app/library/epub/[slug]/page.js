import { notFound, redirect } from "next/navigation";
import LibraryReaderShell from "@/components/library-reader-shell";
import { requireStudentLibraryPageAccess } from "@/lib/library/page-access";
import {
  getLibraryBookReadState,
  getPublishedLibraryBookBySlug,
  listRelatedLibraryBooks,
  recordLibraryReadOpen,
} from "@/lib/library/repository";
import { serializeLibraryReadState } from "@/lib/library/read-state";
import { resolveLibraryReadPayload, resolvePreferredEpubSource } from "@/lib/library/source-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryEpubReadPage({ params: paramsPromise }) {
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

  const preferredEpubSource = await resolvePreferredEpubSource({
    db: supabase,
    book,
    allowSourceSync: false,
  });

  if (!preferredEpubSource?.id) {
    redirect(`/app/library/read/${book.slug}`);
  }

  await recordLibraryReadOpen({
    db: supabase,
    userId: user.id,
    libraryBookId: book.id,
  });

  const readState = await getLibraryBookReadState({
    db: supabase,
    userId: user.id,
    libraryBookId: book.id,
  });
  const serializedReadState = serializeLibraryReadState(readState);

  const initialReaderPayload = await resolveLibraryReadPayload({
    db: supabase,
    book,
    allowSourceSync: false,
  });

  const relatedBooks = await listRelatedLibraryBooks({
    db: supabase,
    book,
    userId: user.id,
    limit: 4,
  });

  return (
    <LibraryReaderShell
      initialBook={book}
      initialRelatedBooks={relatedBooks}
      initialReaderPayload={{
        ...initialReaderPayload,
        readState: serializedReadState,
      }}
    />
  );
}
