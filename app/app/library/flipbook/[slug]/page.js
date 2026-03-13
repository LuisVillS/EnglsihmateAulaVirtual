import { notFound, redirect } from "next/navigation";
import FlipbookShell from "@/components/flipbook/flipbook-shell";
import { requireStudentLibraryPageAccess } from "@/lib/library/page-access";
import { getPublishedLibraryBookBySlug, recordLibraryReadOpen } from "@/lib/library/repository";
import { resolvePreferredEpubSource, sourceHasReadableEpubAsset } from "@/lib/library/source-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryFlipbookReadPage({ params: paramsPromise, searchParams: searchParamsPromise }) {
  const { supabase, user, isGuest } = await requireStudentLibraryPageAccess({
    allowGuest: true,
    allowAdmin: true,
  });
  const params = await paramsPromise;
  await searchParamsPromise;

  const book = await getPublishedLibraryBookBySlug({
    db: supabase,
    slug: params?.slug,
    userId: user?.id || "",
  });
  if (!book?.id) {
    notFound();
  }

  const source = await resolvePreferredEpubSource({
    db: supabase,
    book,
    allowSourceSync: false,
  });
  if (!sourceHasReadableEpubAsset(source)) {
    redirect(`/app/library/read/${book.slug}`);
  }

  if (!isGuest && user?.id) {
    await recordLibraryReadOpen({
      db: supabase,
      userId: user.id,
      libraryBookId: book.id,
    });
  }

  return <FlipbookShell initialBook={book} />;
}
