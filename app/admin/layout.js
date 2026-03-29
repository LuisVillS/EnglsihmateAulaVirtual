import { headers } from "next/headers";
import AdminShell from "@/components/admin-shell";
import { getRequestUserContext } from "@/lib/request-user-context";

export default async function AdminLayout({ children }) {
  const requestHeaders = await headers();
  const isCrmRoute = requestHeaders.get("x-admin-crm-route") === "1";
  const context = await getRequestUserContext();
  const isAdmin = Boolean(context.isAdmin);

  if (!isAdmin || isCrmRoute) {
    return <div className="min-h-screen bg-background text-foreground">{children}</div>;
  }

  return (
    <AdminShell
      user={{
        name: context.displayName,
        email: context.user?.email || "",
        avatarUrl: context.avatarUrl,
      }}
    >
      {children}
    </AdminShell>
  );
}
