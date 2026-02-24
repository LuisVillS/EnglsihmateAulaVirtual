import { redirect } from "next/navigation";

export default async function LegacyPreLoginPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = new URLSearchParams();
  if (params.code) query.set("code", params.code.toString());
  if (params.error) query.set("error", params.error.toString());
  redirect(`/login/access${query.toString() ? `?${query.toString()}` : ""}`);
}
