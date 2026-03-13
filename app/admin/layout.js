import AdminNavbar from "./admin-navbar";
import { getRequestUserContext } from "@/lib/request-user-context";

export default async function AdminLayout({ children }) {
  const context = await getRequestUserContext();
  const isAdmin = Boolean(context.isAdmin);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {isAdmin ? <AdminNavbar /> : null}
      {children}
    </div>
  );
}
