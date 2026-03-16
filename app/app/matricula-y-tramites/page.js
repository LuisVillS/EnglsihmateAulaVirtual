import { redirect } from "next/navigation";
import StudentHubCard from "@/components/student-hub-card";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";

export const metadata = {
  title: "Matrícula y Trámites | Aula Virtual",
};

export default async function MatriculaYTramitesPage() {
  const { user, role } = await getRequestUserContext();

  if (!user) redirect("/login");
  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const cards = [
    {
      title: "Mi matrícula",
      description: "Consulta tu estado de matrícula, renovaciones y pagos pendientes desde el flujo actual.",
      href: "/app/matricula",
      icon: "matricula",
      accentClass: "bg-[#dce8ff]",
      iconClass: "text-[#103474]",
    },
    {
      title: "Trámites",
      description: "Encuentra accesos rápidos para gestiones administrativas, soporte y seguimiento de solicitudes.",
      href: "/app/tramites",
      icon: "tramites",
      accentClass: "bg-[#ffe3c9]",
      iconClass: "text-[#d97706]",
    },
    {
      title: "Planes de estudio",
      description: "Revisa tu ruta académica, tus cursos activos y el recorrido de niveles dentro del portal.",
      href: "/app/ruta-academica",
      icon: "plan",
      accentClass: "bg-[#e4ddff]",
      iconClass: "text-[#7c3aed]",
    },
    {
      title: "Oportunidades académicas",
      description: "Explora recursos complementarios, sesiones extra y espacios para seguir avanzando.",
      href: "/app/oportunidades-academicas",
      icon: "opportunities",
      accentClass: "bg-[#d8f0dc]",
      iconClass: "text-[#15803d]",
    },
  ];

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel px-5 py-5 sm:px-6">
        <p className="text-xs uppercase tracking-[0.34em] text-muted">My studies</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Matrícula y Trámites</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Centraliza gestiones académicas, seguimiento administrativo y accesos rápidos desde una vista más clara.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <StudentHubCard key={card.title} eyebrow="Campus" {...card} />
        ))}
      </div>
    </section>
  );
}
