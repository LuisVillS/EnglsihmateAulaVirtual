import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryReadPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  redirect(`/app/library/flipbook/${params?.slug}`);
}
