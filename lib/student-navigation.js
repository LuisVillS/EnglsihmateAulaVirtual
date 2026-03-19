import { isForcedSpanishStudentPath } from "@/lib/student-ui-language";

const ROUTE_META = [
  { href: "/app/library/flipbook/", titleEs: "Biblioteca", titleEn: "Library" },
  { href: "/app/library/read/", titleEs: "Biblioteca", titleEn: "Library" },
  { href: "/app/library/epub/", titleEs: "Biblioteca", titleEn: "Library" },
  { href: "/app/library/book/", titleEs: "Biblioteca", titleEn: "Library" },
  { href: "/app/clases/", titleEs: "Mi curso", titleEn: "My course" },
  { href: "/app/study-with-me", titleEs: "Study with me", titleEn: "Study with me" },
  { href: "/app/calendario", titleEs: "Calendario", titleEn: "Calendar" },
  { href: "/app/matricula-y-tramites", titleEs: "Matrícula y Trámites", titleEn: "Matrícula y Trámites" },
  { href: "/app/tramites", titleEs: "Trámites", titleEn: "Trámites" },
  { href: "/app/oportunidades-academicas", titleEs: "Oportunidades académicas", titleEn: "Academic opportunities" },
  { href: "/app/matricula", titleEs: "Mi matrícula", titleEn: "Mi matrícula" },
  { href: "/app/library", titleEs: "Biblioteca", titleEn: "Library" },
  { href: "/app/discord", titleEs: "Discord", titleEn: "Discord" },
  { href: "/app/ruta-academica", titleEs: "Ruta académica", titleEn: "Academic path" },
  { href: "/app/curso", titleEs: "Mi curso", titleEn: "My course" },
  { href: "/app/practice", titleEs: "Let's Practice", titleEn: "Let's Practice" },
  { href: "/app/leaderboard", titleEs: "Ranking", titleEn: "Ranking" },
  { href: "/app/competition", titleEs: "Ranking", titleEn: "Ranking" },
  { href: "/app/flashcards", titleEs: "Let's Practice", titleEn: "Let's Practice" },
  { href: "/app", titleEs: "Inicio", titleEn: "Dashboard" },
];

export function getStudentDashboardItem(language = "es") {
  return {
    label: language === "en" ? "Dashboard" : "Inicio",
    href: "/app",
    icon: "home",
  };
}

export function getStudentNavSections(language = "es") {
  const isEnglish = language === "en";
  return [
    {
      id: "study",
      label: isEnglish ? "Study" : "Estudio",
      items: [
        { label: isEnglish ? "My course" : "Mi curso", href: "/app/curso", icon: "book" },
        { label: isEnglish ? "Calendar" : "Calendario", href: "/app/calendario", icon: "calendar" },
        { label: "Let's Practice", href: "/app/practice", icon: "practice" },
        { label: "Ranking", href: "/app/leaderboard", icon: "competition" },
        { label: "Study with me", href: "/app/study-with-me", icon: "study" },
      ],
    },
    {
      id: "explore",
      label: isEnglish ? "Explore" : "Explorar",
      items: [
        { label: isEnglish ? "Library" : "Biblioteca", href: "/app/library", icon: "library" },
        { label: "Discord", href: "/app/discord", icon: "discord" },
      ],
    },
    {
      id: "my-studies",
      label: isEnglish ? "My studies" : "Mis estudios",
      items: [{ label: "Matrícula y Trámites", href: "/app/matricula-y-tramites", icon: "clipboard" }],
    },
  ];
}

export function getStudentRouteMeta(pathname = "", fallbackTitle = "Dashboard", language = "es") {
  const normalized = String(pathname || "").trim();
  const forceSpanish = isForcedSpanishStudentPath(normalized);
  const isEnglish = language === "en" && !forceSpanish;
  const match = ROUTE_META.find((entry) => (entry.href === "/app" ? normalized === "/app" : normalized.startsWith(entry.href)));

  if (match) {
    return {
      href: match.href,
      title: isEnglish ? match.titleEn : match.titleEs,
    };
  }

  return {
    href: normalized || "/app",
    title: isEnglish ? fallbackTitle : fallbackTitle === "Dashboard" ? "Inicio" : fallbackTitle,
  };
}
