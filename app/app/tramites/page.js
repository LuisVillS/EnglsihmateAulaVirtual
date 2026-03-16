import { redirect } from "next/navigation";
import StudentHubCard from "@/components/student-hub-card";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";

const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_WA_URL || "https://wa.me/";

export const metadata = {
  title: "Trámites | Aula Virtual",
};

export default async function TramitesPage() {
  const { user, role } = await getRequestUserContext();

  if (!user) redirect("/login");
  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel px-5 py-5 sm:px-6">
        <p className="text-xs uppercase tracking-[0.34em] text-muted">Gestiones</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Trámites</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Revisa tus gestiones frecuentes y usa los accesos disponibles sin cambiar el flujo actual del portal.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <StudentHubCard
          href="/app/matricula"
          eyebrow="Matrícula"
          title="Renovación y pagos"
          description="Continúa con tu matrícula, revisa estados y completa renovaciones desde el flujo ya existente."
          icon="matricula"
          accentClass="bg-[#dce8ff]"
          iconClass="text-[#103474]"
        />
        <StudentHubCard
          href={SUPPORT_URL}
          eyebrow="Soporte"
          title="Ayuda administrativa"
          description="Contacta soporte para dudas sobre documentos, pagos o seguimiento de tu proceso."
          icon="support"
          accentClass="bg-[#e6ecff]"
          iconClass="text-[#103474]"
        />
        <StudentHubCard
          href="/app/matricula-y-tramites"
          eyebrow="Campus"
          title="Volver al panel"
          description="Regresa al hub principal para navegar entre matrícula, planes de estudio y oportunidades."
          icon="tramites"
          accentClass="bg-[#ffe3c9]"
          iconClass="text-[#d97706]"
        />
      </div>
    </section>
  );
}
