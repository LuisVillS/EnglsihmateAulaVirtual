import { redirect } from "next/navigation";

export const metadata = {
  title: "Panel admin | Aula Virtual",
};

export default function AdminPanelRedirect() {
  redirect("/admin/login");
}
