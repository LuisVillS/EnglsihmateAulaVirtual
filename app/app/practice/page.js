import { redirect } from "next/navigation";

export const metadata = {
  title: "Practice Lab | Aula Virtual",
};

export default function PracticePage() {
  redirect("/app");
}
