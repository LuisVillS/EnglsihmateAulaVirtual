import { redirect } from "next/navigation";

export const metadata = {
  title: "Library Import | Admin",
};

export default function AdminLibraryStagingPage() {
  redirect("/admin/library/import");
}
