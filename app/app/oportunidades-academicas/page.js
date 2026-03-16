import { redirect } from "next/navigation";
import StudentHubCard from "@/components/student-hub-card";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";

export const metadata = {
  title: "Oportunidades académicas | Aula Virtual",
};

export default async function OportunidadesAcademicasPage() {
  const { user, role } = await getRequestUserContext();

  if (!user) redirect("/login");
  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel px-5 py-5 sm:px-6">
        <p className="text-xs uppercase tracking-[0.34em] text-muted">Proyección</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Oportunidades académicas</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Accede a recursos, espacios de práctica y herramientas que complementan tu avance dentro del campus.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <StudentHubCard
          href="/app/study-with-me"
          eyebrow="Premium"
          title="Study With Me"
          description="Reserva sesiones personalizadas y aprovecha la práctica guiada disponible para alumnos habilitados."
          icon="opportunities"
          accentClass="bg-[#e4ddff]"
          iconClass="text-[#7c3aed]"
        />
        <StudentHubCard
          href="/app/library"
          eyebrow="Biblioteca"
          title="Lecturas y recursos"
          description="Explora la biblioteca, guarda libros y suma práctica adicional fuera de clase."
          icon="plan"
          accentClass="bg-[#dce8ff]"
          iconClass="text-[#103474]"
        />
        <StudentHubCard
          href="/app/discord"
          eyebrow="Comunidad"
          title="Comunidad y actividades"
          description="Mantente cerca de la comunidad y de los espacios donde puedes seguir practicando inglés."
          icon="support"
          accentClass="bg-[#d8f0dc]"
          iconClass="text-[#15803d]"
        />
      </div>
    </section>
  );
}
