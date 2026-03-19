export const ADMIN_NAV_SECTIONS = [
  {
    id: "operations",
    label: "Operaciones",
    items: [
      { href: "/admin", label: "Panel", icon: "dashboard" },
      { href: "/admin/students", label: "Alumnos", icon: "students" },
      { href: "/admin/commissions", label: "Comisiones", icon: "calendar" },
      { href: "/admin/prematriculas", label: "Pre-matriculas", icon: "wallet" },
      { href: "/admin/teacher-dashboard", label: "Panel docente", icon: "analytics" },
      { href: "/admin/discord", label: "Discord", icon: "discord" },
    ],
  },
  {
    id: "content",
    label: "Contenido",
    items: [
      { href: "/admin/courses/templates", label: "Plantillas", icon: "template" },
      { href: "/admin/exercises", label: "Ejercicios", icon: "exercise" },
      { href: "/admin/flashcards", label: "Flashcards", icon: "flashcards" },
      { href: "/admin/library", label: "Biblioteca", icon: "library" },
    ],
  },
];

const ROUTE_META = [
  { href: "/admin/teacher-dashboard/", title: "Panel docente", section: "Operaciones" },
  { href: "/admin/teacher-dashboard", title: "Panel docente", section: "Operaciones" },
  { href: "/admin/discord/", title: "Discord", section: "Operaciones" },
  { href: "/admin/discord", title: "Discord", section: "Operaciones" },
  { href: "/admin/students/", title: "Alumnos", section: "Operaciones" },
  { href: "/admin/students", title: "Alumnos", section: "Operaciones" },
  { href: "/admin/commissions/", title: "Comisiones", section: "Operaciones" },
  { href: "/admin/commissions", title: "Comisiones", section: "Operaciones" },
  { href: "/admin/courses/templates/", title: "Plantillas", section: "Contenido" },
  { href: "/admin/courses/templates", title: "Plantillas", section: "Contenido" },
  { href: "/admin/courses", title: "Comisiones", section: "Operaciones" },
  { href: "/admin/prematriculas/", title: "Pre-matriculas", section: "Operaciones" },
  { href: "/admin/prematriculas", title: "Pre-matriculas", section: "Operaciones" },
  { href: "/admin/exercises", title: "Ejercicios", section: "Contenido" },
  { href: "/admin/flashcards", title: "Flashcards", section: "Contenido" },
  { href: "/admin/library/", title: "Biblioteca", section: "Contenido" },
  { href: "/admin/library", title: "Biblioteca", section: "Contenido" },
  { href: "/admin", title: "Panel", section: "Operaciones" },
];

export function getAdminRouteMeta(pathname = "", fallbackTitle = "Administracion") {
  const normalized = String(pathname || "").trim();
  const match = ROUTE_META.find((entry) =>
    entry.href === "/admin" ? normalized === "/admin" || normalized === "/admin/" : normalized.startsWith(entry.href)
  );

  if (match) {
    return match;
  }

  return {
    href: normalized || "/admin",
    title: fallbackTitle,
    section: "Administracion",
  };
}
