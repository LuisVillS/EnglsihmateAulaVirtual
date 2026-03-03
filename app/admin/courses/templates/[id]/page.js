import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  deleteTemplateSessionExerciseBatch,
  upsertTemplateSession,
  upsertTemplateSessionItem,
  deleteTemplateSessionItem,
} from "@/app/admin/actions";
import { getFrequencyReference } from "@/lib/course-sessions";
import TemplateForm from "../template-form";

export const metadata = {
  title: "Editar plantilla | Admin",
};

const MATERIAL_TYPE_OPTIONS = [
  { value: "slides", label: "Google Slides" },
  { value: "link", label: "Enlace" },
  { value: "file", label: "Archivo" },
  { value: "video", label: "Video" },
];

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

function formatFrequencyLabel(value) {
  const map = {
    DAILY: "Daily (L-V)",
    MWF: "Interdiario 1 (LMV)",
    TT: "Interdiario 2 (MJ)",
    SAT: "Sabatinos (Sabados)",
  };
  return map[value] || value || "-";
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function resolveSessionPosition(row, sessionsPerMonth) {
  const monthIndex = Number(row?.month_index);
  const sessionInMonth = Number(row?.session_in_month);
  if (Number.isInteger(monthIndex) && monthIndex >= 1 && Number.isInteger(sessionInMonth) && sessionInMonth >= 1) {
    return { monthIndex, sessionInMonth };
  }

  const cycleIndex = Number(row?.session_in_cycle);
  if (!Number.isInteger(cycleIndex) || cycleIndex < 1 || sessionsPerMonth < 1) {
    return { monthIndex: null, sessionInMonth: null };
  }

  return {
    monthIndex: Math.floor((cycleIndex - 1) / sessionsPerMonth) + 1,
    sessionInMonth: ((cycleIndex - 1) % sessionsPerMonth) + 1,
  };
}

function buildSessionNumber(monthIndex, sessionInMonth, sessionsPerMonth) {
  if (!sessionsPerMonth) return null;
  return (monthIndex - 1) * sessionsPerMonth + sessionInMonth;
}

function buildSessionBadge(monthIndex, sessionInMonth, sessionsPerMonth) {
  const sessionNumber = buildSessionNumber(monthIndex, sessionInMonth, sessionsPerMonth);
  if (sessionNumber) {
    return `Clase ${String(sessionNumber).padStart(2, "0")}`;
  }
  return `Mes ${monthIndex} / Clase ${sessionInMonth}`;
}

function formatMaterialTypeLabel(type) {
  const value = String(type || "").trim();
  const row = MATERIAL_TYPE_OPTIONS.find((option) => option.value === value);
  return row?.label || "Material";
}

function normalizeAdditionalSlides(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (typeof item === "string") {
        const url = item.trim();
        if (!url) return null;
        return { title: "", url };
      }
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || "").trim();
      const url = String(item.url || "").trim();
      if (!url) return null;
      return { title, url };
    })
    .filter(Boolean);
}

function toAdditionalSlidesInput(slides) {
  return normalizeAdditionalSlides(slides)
    .map((item) => (item.title ? `${item.title}|${item.url}` : item.url))
    .join("\n");
}

function parseGoogleSlideMeta(url) {
  const text = String(url || "").trim();
  if (!text) return { presentationId: "", slideId: "" };

  const presentationMatch = text.match(/\/presentation\/d\/([^/]+)/i);
  const presentationId = presentationMatch?.[1] || "";
  let slideId = "";

  try {
    const parsed = new URL(text);
    slideId = parsed.searchParams.get("slide") || "";
    if (!slideId && parsed.hash) {
      const hashValue = parsed.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hashValue);
      slideId = hashParams.get("slide") || "";
      if (!slideId && hashValue.startsWith("slide=")) {
        slideId = hashValue.replace(/^slide=/, "");
      }
    }
  } catch {
    const inlineSlideMatch = text.match(/slide=([^&#]+)/i);
    slideId = inlineSlideMatch?.[1] || "";
  }

  return { presentationId, slideId };
}

function buildSlidePreviewUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    parsed.pathname = parsed.pathname.replace(/\/edit$/i, "/preview");
    if (!parsed.searchParams.get("rm")) {
      parsed.searchParams.set("rm", "minimal");
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

export default async function CourseTemplateDetailPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const templateId = params?.id?.toString();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!adminRecord?.id) redirect("/admin/login");

  const { data: template } = await supabase
    .from("course_templates")
    .select("id, course_level, frequency, template_name")
    .eq("id", templateId)
    .maybeSingle();
  if (!template?.id) redirect("/admin/courses/templates");

  const frequencyReference = getFrequencyReference(template.frequency);
  const durationMonths = frequencyReference?.months || 1;
  const sessionsPerMonth = frequencyReference?.sessionsPerMonth || 0;
  const totalSessions = sessionsPerMonth * durationMonths;

  let missingSlideColumns = false;
  let sessionsResult = await supabase
    .from("template_sessions")
    .select(
      "id, month_index, session_in_month, session_in_cycle, title, class_slide_url, class_slide_title, additional_slides"
    )
    .eq("template_id", template.id)
    .order("month_index", { ascending: true })
    .order("session_in_month", { ascending: true });

  const missingSessionColumn = getMissingColumnFromError(sessionsResult.error);
  if (
    sessionsResult.error &&
    (missingSessionColumn === "class_slide_url" ||
      missingSessionColumn === "class_slide_title" ||
      missingSessionColumn === "additional_slides")
  ) {
    missingSlideColumns = true;
    sessionsResult = await supabase
      .from("template_sessions")
      .select("id, month_index, session_in_month, session_in_cycle, title")
      .eq("template_id", template.id)
      .order("month_index", { ascending: true })
      .order("session_in_month", { ascending: true });
  }

  const sessionsRows = sessionsResult.data || [];
  const sessionsError = sessionsResult.error;
  const needsSchemaUpdate =
    missingSessionColumn === "month_index" || missingSessionColumn === "session_in_month";

  const sessions = sessionsRows
    .map((row) => {
      const position = resolveSessionPosition(row, sessionsPerMonth);
      if (!position.monthIndex || !position.sessionInMonth) return null;
      return {
        ...row,
        monthIndex: position.monthIndex,
        sessionInMonth: position.sessionInMonth,
        class_slide_url: String(row.class_slide_url || "").trim(),
        class_slide_title: String(row.class_slide_title || "").trim(),
        additional_slides: Array.isArray(row.additional_slides) ? row.additional_slides : [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.monthIndex !== b.monthIndex) return a.monthIndex - b.monthIndex;
      return a.sessionInMonth - b.sessionInMonth;
    });

  const sessionIds = sessions.map((row) => row.id);
  let itemsBySession = new Map();
  let flashcardsBySession = new Map();
  let missingExerciseColumn = false;
  let itemsErrorMessage = null;
  let flashcardsErrorMessage = null;

  if (sessionIds.length) {
    let itemsResult = await supabase
      .from("template_session_items")
      .select(
        `
        id,
        template_session_id,
        type,
        title,
        url,
        exercise_id,
        exercise:exercises (
          id,
          type,
          status,
          prompt
        ),
        created_at
      `
      )
      .in("template_session_id", sessionIds)
      .order("created_at", { ascending: true });

    if (itemsResult.error && getMissingColumnFromError(itemsResult.error) === "exercise_id") {
      missingExerciseColumn = true;
      itemsResult = await supabase
        .from("template_session_items")
        .select("id, template_session_id, type, title, url, created_at")
        .in("template_session_id", sessionIds)
        .order("created_at", { ascending: true });
    }

    if (itemsResult.error) {
      itemsErrorMessage = itemsResult.error.message || "No se pudieron cargar materiales de plantilla.";
    } else {
      const itemRows = itemsResult.data || [];
      itemsBySession = itemRows.reduce((acc, item) => {
        const current = acc.get(item.template_session_id) || [];
        current.push(item);
        acc.set(item.template_session_id, current);
        return acc;
      }, new Map());
    }

    const flashcardsResult = await supabase
      .from("template_session_flashcards")
      .select("id, template_session_id")
      .in("template_session_id", sessionIds)
      .order("card_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (flashcardsResult.error) {
      const missingTable = getMissingTableName(flashcardsResult.error);
      flashcardsErrorMessage = missingTable?.endsWith("template_session_flashcards")
        ? "Falta crear la tabla template_session_flashcards."
        : (flashcardsResult.error.message || "No se pudieron cargar flashcards de plantilla.");
    } else {
      flashcardsBySession = (flashcardsResult.data || []).reduce((acc, item) => {
        const current = acc.get(item.template_session_id) || [];
        current.push(item);
        acc.set(item.template_session_id, current);
        return acc;
      }, new Map());
    }
  }

  const monthIndexes = Array.from({ length: durationMonths }, (_, idx) => idx + 1);
  const sessionsByMonth = sessions.reduce((acc, session) => {
    const current = acc.get(session.monthIndex) || [];
    current.push(session);
    acc.set(session.monthIndex, current);
    return acc;
  }, new Map());

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Plantillas</p>
            <h1 className="text-3xl font-semibold">{template.template_name || "Plantilla"}</h1>
            <p className="text-sm text-muted">
              {template.course_level} - {formatFrequencyLabel(template.frequency)} - {sessionsPerMonth} clases/mes -{" "}
              {durationMonths} meses
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/courses/templates"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver
            </Link>
            <Link
              href="/admin/commissions"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Comisiones
            </Link>
          </div>
        </header>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <TemplateForm key={template.id} template={template} />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Total esperado de clases: <span className="font-semibold text-foreground">{totalSessions || sessions.length}</span>. Los
          ejercicios aportan hasta el 50% de la nota final.
        </div>

        {needsSchemaUpdate ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Falta actualizar template_sessions con month_index/session_in_month. Ejecuta el SQL actualizado.
          </div>
        ) : null}
        {missingSlideColumns ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Falta actualizar template_sessions con class_slide_url/class_slide_title/additional_slides. Ejecuta el SQL
            actualizado para habilitar gestion opcional de slide principal.
          </div>
        ) : null}
        {sessionsError ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {sessionsError.message || "No se pudieron cargar sesiones de plantilla."}
          </div>
        ) : null}
        {itemsErrorMessage ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {itemsErrorMessage}
          </div>
        ) : null}
        {flashcardsErrorMessage ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {flashcardsErrorMessage}
          </div>
        ) : null}
        {missingExerciseColumn ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Falta la columna exercise_id en template_session_items. Ejecuta el SQL actualizado.
          </div>
        ) : null}

        <div className="space-y-4">
          {monthIndexes.map((monthIndex) => {
            const monthSessions = sessionsByMonth.get(monthIndex) || [];
            return (
              <details
                key={monthIndex}
                open={monthIndex === 1}
                className="rounded-2xl border border-border bg-surface p-4"
              >
                <summary className="cursor-pointer text-base font-semibold text-foreground">
                  Mes {monthIndex} - {monthSessions.length || sessionsPerMonth} clases
                </summary>
                <div className="mt-4 space-y-4">
                  {monthSessions.map((session) => {
                    const items = itemsBySession.get(session.id) || [];
                    const flashcardsItem = items.find((item) => item.type === "flashcards") || null;
                    const flashcards = flashcardsBySession.get(session.id) || [];
                    const exerciseItems = items.filter((item) => {
                      if (item.type !== "exercise" || !item.exercise_id) return false;
                      const exerciseStatus = String(item?.exercise?.status || "")
                        .trim()
                        .toLowerCase();
                      return exerciseStatus === "draft" || exerciseStatus === "published";
                    });
                    const materialItems = items.filter(
                      (item) => item.type !== "exercise" && item.type !== "flashcards"
                    );
                    const additionalSlides = normalizeAdditionalSlides(session.additional_slides);
                    const slidesExtraCount =
                      additionalSlides.length + materialItems.filter((item) => item.type === "slides").length;
                    const linksCount = materialItems.filter((item) => item.type !== "slides").length;
                    const sessionBadge = buildSessionBadge(monthIndex, session.sessionInMonth, sessionsPerMonth);
                    const slideMeta = parseGoogleSlideMeta(session.class_slide_url);
                    const slidePreviewUrl = buildSlidePreviewUrl(session.class_slide_url);
                    const hasQuizRows = items.some(
                      (item) => item.type === "exercise" || Boolean(item.exercise_id)
                    );
                    const hasQuiz = exerciseItems.length > 0;

                    return (
                      <article key={session.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.22em] text-muted">{sessionBadge}</p>
                            <h3 className="text-lg font-semibold text-foreground">{session.title || "Clase sin titulo"}</h3>
                            <p className="text-xs text-muted">
                              Materiales: {materialItems.length} - Prueba: {exerciseItems.length} ejercicio
                              {exerciseItems.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                          <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                              Configuracion de clase
                            </p>
                            <form action={upsertTemplateSession} className="space-y-3">
                              <input type="hidden" name="templateId" value={template.id} />
                              <input type="hidden" name="templateSessionId" value={session.id} />
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo de clase</label>
                                <input
                                  name="title"
                                  defaultValue={session.title || ""}
                                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                                  Slide de clase (opcional)
                                </label>
                                <input
                                  name="classSlideUrl"
                                  defaultValue={session.class_slide_url || ""}
                                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                  placeholder="https://docs.google.com/presentation/d/.../edit?slide=id..."
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                                  Nombre de presentacion (opcional)
                                </label>
                                <input
                                  name="classSlideTitle"
                                  defaultValue={session.class_slide_title || ""}
                                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                  placeholder="Unidad 2 - Clase 05"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                                  Slides adicionales (opcional)
                                </label>
                                <textarea
                                  name="additionalSlidesInput"
                                  rows={4}
                                  defaultValue={toAdditionalSlidesInput(session.additional_slides)}
                                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                  placeholder={"https://docs.google.com/presentation/d/...\nRepaso|https://docs.google.com/presentation/d/..."}
                                />
                                <p className="text-xs text-muted">Formato por linea: `url` o `titulo|url`.</p>
                              </div>
                              <button
                                type="submit"
                                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                              >
                                Guardar clase
                              </button>
                            </form>

                            <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted">
                              <p className="font-semibold text-foreground">Slide principal (opcional)</p>
                              <p className="mt-1">
                                Presentacion: {session.class_slide_title || slideMeta.presentationId || "Sin nombre"}
                              </p>
                              <p>slide_id: {slideMeta.slideId || "No especificado en URL"}</p>
                              {session.class_slide_url ? (
                                <a
                                  href={session.class_slide_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-flex rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                                >
                                  Abrir slide
                                </a>
                              ) : null}
                              {slidePreviewUrl ? (
                                <div className="mt-3 overflow-hidden rounded-xl border border-border bg-background">
                                  <iframe
                                    src={slidePreviewUrl}
                                    title={`Preview ${session.title || session.id}`}
                                    className="h-48 w-full"
                                    loading="lazy"
                                  />
                                </div>
                              ) : (
                                <p className="mt-2 text-muted">Sin slide principal configurado.</p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="rounded-2xl border border-primary/30 bg-primary/8 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Prueba / Test</p>
                              <p className="mt-1 text-sm text-foreground">{hasQuizRows ? "Creada" : "No creada"}</p>
                              <p className="text-xs text-muted">
                                {exerciseItems.length} ejercicio{exerciseItems.length === 1 ? "" : "s"}
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <Link
                                  href={`/admin/courses/templates/${template.id}/sessions/${session.id}/exercises`}
                                  className="inline-flex flex-1 justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                                >
                                  {hasQuizRows ? "Editar prueba" : "Crear prueba para esta clase"}
                                </Link>
                                {hasQuizRows ? (
                                  <form action={deleteTemplateSessionExerciseBatch}>
                                    <input type="hidden" name="templateId" value={template.id} />
                                    <input type="hidden" name="templateSessionId" value={session.id} />
                                    <button
                                      type="submit"
                                      title="Eliminar prueba completa"
                                      aria-label="Eliminar prueba completa"
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-danger/60 text-danger transition hover:bg-danger/10"
                                    >
                                      <TrashIcon />
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-surface p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Flashcards</p>
                              <p className="mt-1 text-sm text-foreground">
                                {flashcards.length ? "Set creado" : flashcardsItem ? "Material creado" : "No creado"}
                              </p>
                              <p className="text-xs text-muted">
                                {flashcards.length} tarjeta{flashcards.length === 1 ? "" : "s"}
                              </p>
                              <Link
                                href={`/admin/courses/templates/${template.id}/sessions/${session.id}/flashcards`}
                                className="mt-3 inline-flex w-full justify-center rounded-xl border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                              >
                                {flashcards.length || flashcardsItem ? "Editar flashcards" : "Agregar flashcards"}
                              </Link>
                            </div>

                            <details className="rounded-2xl border border-border bg-surface p-4">
                              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                                Materiales de clase: {materialItems.length} items - Slides extra: {slidesExtraCount} - Links: {linksCount}
                              </summary>
                              <div className="mt-3 space-y-3">
                                {additionalSlides.length ? (
                                  <div className="rounded-xl border border-border bg-surface-2 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Slides adicionales guardados</p>
                                    <ul className="mt-2 space-y-1 text-xs text-muted">
                                      {additionalSlides.map((slide, idx) => (
                                        <li key={`${session.id}-extra-slide-${idx}`}>
                                          {slide.title ? `${slide.title}: ` : ""}
                                          <a
                                            href={slide.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-foreground underline decoration-border underline-offset-2"
                                          >
                                            {slide.url}
                                          </a>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {materialItems.map((item) => (
                                  <div key={item.id} className="rounded-xl border border-border bg-surface-2 p-3">
                                    <form action={upsertTemplateSessionItem} className="grid gap-2">
                                      <input type="hidden" name="templateId" value={template.id} />
                                      <input type="hidden" name="templateSessionId" value={session.id} />
                                      <input type="hidden" name="itemId" value={item.id} />
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        <select
                                          name="type"
                                          defaultValue={item.type || "link"}
                                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                        >
                                          {MATERIAL_TYPE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                        <input
                                          name="title"
                                          defaultValue={item.title || ""}
                                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                          placeholder="Titulo"
                                          required
                                        />
                                      </div>
                                      <input
                                        name="url"
                                        defaultValue={item.url || ""}
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                        placeholder="https://..."
                                        required
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                                      >
                                        Guardar
                                      </button>
                                    </form>
                                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                                      <span>{formatMaterialTypeLabel(item.type)}</span>
                                      <form action={deleteTemplateSessionItem}>
                                        <input type="hidden" name="templateId" value={template.id} />
                                        <input type="hidden" name="itemId" value={item.id} />
                                        <button
                                          type="submit"
                                          className="rounded-full border border-danger/60 px-3 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                                        >
                                          Eliminar
                                        </button>
                                      </form>
                                    </div>
                                  </div>
                                ))}

                                {!materialItems.length ? (
                                  <p className="text-sm text-muted">Sin materiales extra en esta clase.</p>
                                ) : null}

                                <div className="rounded-xl border border-dashed border-border bg-surface-2 p-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Agregar material extra</p>
                                  <form action={upsertTemplateSessionItem} className="mt-2 space-y-2">
                                    <input type="hidden" name="templateId" value={template.id} />
                                    <input type="hidden" name="templateSessionId" value={session.id} />
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <select
                                        name="type"
                                        defaultValue="slides"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                      >
                                        {MATERIAL_TYPE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        name="title"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                        placeholder="Titulo"
                                        required
                                      />
                                    </div>
                                    <input
                                      name="url"
                                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                      placeholder="https://..."
                                      required
                                    />
                                    <button
                                      type="submit"
                                      className="w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                                    >
                                      Agregar material
                                    </button>
                                  </form>
                                </div>
                              </div>
                            </details>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {!monthSessions.length ? (
                    <div className="rounded-xl border border-dashed border-border bg-surface-2 px-3 py-3 text-sm text-muted">
                      Aun no hay clases cargadas para este mes.
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
