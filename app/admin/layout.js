import AdminNavbar from "./admin-navbar";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function AdminLayout({ children }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;

  if (user) {
    const { data: adminRecord } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = Boolean(adminRecord?.id);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {isAdmin ? <AdminNavbar /> : null}
      {children}
    </div>
  );
}
