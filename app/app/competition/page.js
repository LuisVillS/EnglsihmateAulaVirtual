import { redirect } from "next/navigation";

export const metadata = {
  title: "Weekly Competition | Aula Virtual",
};

export default async function CompetitionPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const params = new URLSearchParams();
  const view = String(searchParams?.view || "").trim().toLowerCase();
  if (view) {
    params.set("view", view);
  }
  redirect(params.toString() ? `/app/leaderboard?${params.toString()}` : "/app/leaderboard");
}
