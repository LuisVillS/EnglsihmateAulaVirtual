import CrmShell from "@/components/crm/crm-shell";
import { requireCrmPageAccess } from "@/lib/admin/access";

export default async function CrmLayout({ children }) {
  const { user, context } = await requireCrmPageAccess();

  return (
    <CrmShell
      user={{
        name: context?.displayName || user?.user_metadata?.full_name || user?.email || "CRM user",
        email: user?.email || "",
        roleLabel: context?.isClassicAdmin ? "Classic admin" : context?.isCrmAdmin ? "CRM admin" : "CRM operator",
        isClassicAdmin: Boolean(context?.isClassicAdmin),
      }}
    >
      {children}
    </CrmShell>
  );
}
