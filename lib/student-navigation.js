export const STUDENT_DASHBOARD_ITEM = {
  label: "My dashboard",
  href: "/app",
  icon: "home",
};

export const STUDENT_NAV_SECTIONS = [
  {
    id: "study",
    label: "Study",
    items: [
      { label: "My course", href: "/app/curso", icon: "book" },
      { label: "Calendar", href: "/app/calendario", icon: "calendar" },
      { label: "Let's practice", href: "/app/practice", icon: "practice" },
      { label: "Weekly Competition", href: "/app/competition", icon: "competition" },
      { label: "Flashcard Arcade", href: "/app/flashcards", icon: "flashcards" },
      { label: "Study with me", href: "/app/study-with-me", icon: "study" },
    ],
  },
  {
    id: "explore",
    label: "Explore",
    items: [
      { label: "Library", href: "/app/library", icon: "library" },
      { label: "Discord", href: "/app/discord", icon: "discord" },
    ],
  },
  {
    id: "my-studies",
    label: "My studies",
    items: [
      { label: "Matrícula y Trámites", href: "/app/matricula-y-tramites", icon: "clipboard" },
    ],
  },
];

const ROUTE_META = [
  { href: "/app/library/flipbook/", title: "Library" },
  { href: "/app/library/read/", title: "Library" },
  { href: "/app/library/epub/", title: "Library" },
  { href: "/app/library/book/", title: "Library" },
  { href: "/app/clases/", title: "My course" },
  { href: "/app/study-with-me", title: "Study with me" },
  { href: "/app/calendario", title: "Calendar" },
  { href: "/app/matricula-y-tramites", title: "Matrícula y Trámites" },
  { href: "/app/tramites", title: "Trámites" },
  { href: "/app/oportunidades-academicas", title: "Oportunidades académicas" },
  { href: "/app/matricula", title: "Mi matrícula" },
  { href: "/app/library", title: "Library" },
  { href: "/app/discord", title: "Discord" },
  { href: "/app/ruta-academica", title: "Academic path" },
  { href: "/app/curso", title: "My course" },
  { href: "/app/practice", title: "Let's practice" },
  { href: "/app/competition", title: "Weekly Competition" },
  { href: "/app/flashcards", title: "Flashcard Arcade" },
  { href: "/app", title: "Dashboard" },
];

export function getStudentRouteMeta(pathname = "", fallbackTitle = "Dashboard") {
  const normalized = String(pathname || "").trim();
  const match = ROUTE_META.find((entry) =>
    entry.href === "/app" ? normalized === "/app" : normalized.startsWith(entry.href)
  );

  if (match) {
    return match;
  }

  return {
    href: normalized || "/app",
    title: fallbackTitle,
  };
}
