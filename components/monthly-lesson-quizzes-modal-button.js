"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppModal from "@/components/app-modal";

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "completed") return "completed";
  if (normalized === "in_progress") return "in_progress";
  return "ready";
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

export default function MonthlyLessonQuizzesModalButton({
  quizzes = [],
  triggerLabel = "Continuar",
  triggerDisabled = false,
  triggerClassName = "",
  currentLessonId = "",
}) {
  const [open, setOpen] = useState(false);

  const rows = useMemo(
    () =>
      (Array.isArray(quizzes) ? quizzes : [])
        .map((quiz) => ({
          lessonId: String(quiz?.lessonId || "").trim(),
          title: String(quiz?.title || "").trim() || "Test de clase",
          subtitle: String(quiz?.subtitle || "").trim(),
          actionUrl: String(quiz?.actionUrl || "").trim(),
          status: normalizeStatus(quiz?.status),
          scorePercent: Number.isFinite(Number(quiz?.scorePercent)) ? Number(quiz.scorePercent) : null,
        }))
        .filter((quiz) => quiz.lessonId && quiz.actionUrl),
    [quizzes]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={triggerDisabled}
        className={
          triggerClassName ||
          "inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-55"
        }
      >
        {triggerLabel}
      </button>

      <AppModal open={open} onClose={() => setOpen(false)} title="Tests del mes actual" widthClass="max-w-2xl">
        {rows.length ? (
          <div className="space-y-3">
            {rows.map((quiz) => {
              const isCompleted = quiz.status === "completed";
              const isCurrent = quiz.lessonId === currentLessonId;
              const actionLabel = isCompleted ? "Ver resultados" : "Resolver";

              return (
                <article
                  key={quiz.lessonId}
                  className="rounded-2xl border border-border bg-surface-2 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{quiz.title}</p>
                      {quiz.subtitle ? <p className="text-xs text-muted">{quiz.subtitle}</p> : null}
                      {!isCompleted && isCurrent ? (
                        <p className="mt-1 text-xs text-muted">Test actual</p>
                      ) : null}
                      {isCompleted ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success">
                          <CheckIcon />
                          Completada
                          {quiz.scorePercent != null ? ` (${Math.round(quiz.scorePercent)}%)` : ""}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-primary">Disponible</p>
                      )}
                    </div>
                    <Link
                      href={quiz.actionUrl}
                      onClick={() => setOpen(false)}
                      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold transition ${
                        isCompleted
                          ? "border border-success/45 bg-success/12 text-success hover:bg-success/20"
                          : "bg-primary text-primary-foreground hover:bg-primary-2"
                      }`}
                    >
                      {actionLabel}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
            No hay tests disponibles para este mes en este momento.
          </p>
        )}
      </AppModal>
    </>
  );
}
