"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import AppModal from "@/components/app-modal";
import {
  upsertExerciseLibraryEntry,
} from "@/app/admin/actions";
import {
  EXERCISE_LIBRARY_LEVELS,
  EXERCISE_LIBRARY_SKILLS,
  getExerciseCategoryLabel,
  getExerciseDisplayTitle,
  normalizeExerciseCategoryName,
} from "@/lib/exercise-library";
import {
  EXERCISE_TYPE_OPTIONS,
  GuidedEditor,
  getDefaultContent,
  normalizeContent,
  safeParseJson,
  toPrettyJson,
} from "@/components/template-session-exercise-builder";

const INITIAL_STATE = {
  success: false,
  error: null,
  message: null,
  exercise: null,
  category: null,
};

function createEmptyValues(defaultSkill = "grammar", defaultLevel = "A1") {
  return {
    exerciseId: "",
    title: "",
    skillTag: defaultSkill,
    cefrLevel: defaultLevel,
    categoryId: "",
    newCategoryName: "",
    type: "cloze",
    contentJson: toPrettyJson(getDefaultContent("cloze")),
  };
}

function toFormValues(exercise, defaultSkill = "grammar", defaultLevel = "A1") {
  if (!exercise) {
    return createEmptyValues(defaultSkill, defaultLevel);
  }

  return {
    exerciseId: String(exercise.id || "").trim(),
    title: String(exercise.title || "").trim(),
    skillTag: String(exercise.skill || defaultSkill).trim() || defaultSkill,
    cefrLevel: String(exercise.cefrLevel || defaultLevel).trim() || defaultLevel,
    categoryId: String(exercise.categoryId || "").trim(),
    newCategoryName: "",
    type: String(exercise.type || "cloze").trim() || "cloze",
    contentJson: toPrettyJson(
      normalizeContent(
        exercise.type || "cloze",
        exercise.contentJson && typeof exercise.contentJson === "object" ? exercise.contentJson : {}
      )
    ),
  };
}

export default function ExerciseLibraryEditorModal({
  open,
  onClose,
  exercise = null,
  categories = [],
  defaultSkill = "grammar",
  defaultLevel = "A1",
  onSaved,
}) {
  const [state, formAction, pending] = useActionState(upsertExerciseLibraryEntry, INITIAL_STATE);
  const [formValues, setFormValues] = useState(() => toFormValues(exercise, defaultSkill, defaultLevel));
  const onSavedRef = useRef(onSaved);
  const onCloseRef = useRef(onClose);
  const handledSaveKeyRef = useRef("");

  useEffect(() => {
    onSavedRef.current = onSaved;
    onCloseRef.current = onClose;
  }, [onClose, onSaved]);

  useEffect(() => {
    if (!open) return;
    setFormValues(toFormValues(exercise, defaultSkill, defaultLevel));
  }, [open, exercise, defaultSkill, defaultLevel]);

  useEffect(() => {
    if (!open) {
      handledSaveKeyRef.current = "";
      return;
    }

    const savedExerciseId = String(state?.exercise?.id || "").trim();
    if (!state?.success || !savedExerciseId) return;

    const saveKey = [
      savedExerciseId,
      String(state?.exercise?.updatedAt || state?.exercise?.updated_at || "").trim(),
      String(state?.message || "").trim(),
    ].join("|");

    if (handledSaveKeyRef.current === saveKey) return;
    handledSaveKeyRef.current = saveKey;

    startTransition(() => {
      onSavedRef.current?.(state.exercise, state.message || "");
      onCloseRef.current?.();
    });
  }, [open, state]);

  const filteredCategories = useMemo(
    () =>
      (Array.isArray(categories) ? categories : []).filter(
        (category) =>
          String(category?.skill || "").trim() === String(formValues.skillTag || "").trim() &&
          String(category?.cefrLevel || "").trim() === String(formValues.cefrLevel || "").trim()
      ),
    [categories, formValues.skillTag, formValues.cefrLevel]
  );

  const selectedCategoryName = useMemo(() => {
    const selected = filteredCategories.find(
      (category) => String(category?.id || "").trim() === String(formValues.categoryId || "").trim()
    );
    return normalizeExerciseCategoryName(selected?.name || "");
  }, [filteredCategories, formValues.categoryId]);

  const parsedContent = safeParseJson(formValues.contentJson);
  const hasInvalidJson = !parsedContent;
  const guidedContent = hasInvalidJson ? null : normalizeContent(formValues.type, parsedContent);
  const displayTitle = useMemo(
    () =>
      getExerciseDisplayTitle(
        formValues.type,
        guidedContent || parsedContent || {},
        formValues.title
      ),
    [formValues.title, formValues.type, guidedContent, parsedContent]
  );

  function updateGuidedContent(patchObject) {
    setFormValues((previous) => {
      const current = normalizeContent(previous.type, safeParseJson(previous.contentJson));
      const next = normalizeContent(previous.type, { ...current, ...patchObject });
      return {
        ...previous,
        contentJson: toPrettyJson(next),
      };
    });
  }

  function updateFolderValue(patch) {
    setFormValues((previous) => {
      const next = { ...previous, ...patch };
      const categoryStillMatches = (Array.isArray(categories) ? categories : []).some(
        (category) => String(category?.id || "").trim() === String(next.categoryId || "").trim()
          && String(category?.skill || "").trim() === String(next.skillTag || "").trim()
          && String(category?.cefrLevel || "").trim() === String(next.cefrLevel || "").trim()
      );
      if (!categoryStillMatches) {
        next.categoryId = "";
      }
      return next;
    });
  }

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={formValues.exerciseId ? "Editar ejercicio" : "Nuevo ejercicio"}
      widthClass="max-w-6xl"
    >
      <div className="space-y-4">
        {state?.error ? (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="exerciseId" value={formValues.exerciseId} readOnly />
          <input type="hidden" name="categoryName" value={selectedCategoryName} readOnly />
          <input type="hidden" name="title" value={displayTitle} readOnly />

          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted">
            Este editor guarda solo el contenido reusable. Los puntos se asignan despues, al agregar el ejercicio a una
            prueba en Plantillas o Comisiones.
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo mostrado</label>
              <div className="rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
                {displayTitle}
              </div>
              <p className="text-xs text-muted">
                Se calcula automaticamente desde el contenido del ejercicio.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo</label>
              <select
                name="type"
                value={formValues.type}
                onChange={(event) =>
                  setFormValues((previous) => ({
                    ...previous,
                    type: event.target.value,
                    contentJson: toPrettyJson(getDefaultContent(event.target.value)),
                  }))
                }
                className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              >
                {EXERCISE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Skill</label>
              <select
                name="skillTag"
                value={formValues.skillTag}
                onChange={(event) => updateFolderValue({ skillTag: event.target.value })}
                className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              >
                {EXERCISE_LIBRARY_SKILLS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">CEFR</label>
              <select
                name="cefrLevel"
                value={formValues.cefrLevel}
                onChange={(event) => updateFolderValue({ cefrLevel: event.target.value })}
                className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              >
                {EXERCISE_LIBRARY_LEVELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Categoria existente</label>
              <select
                name="categoryId"
                value={formValues.categoryId}
                onChange={(event) => setFormValues((previous) => ({ ...previous, categoryId: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              >
                <option value="">{getExerciseCategoryLabel("")}</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {getExerciseCategoryLabel(category.name)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Crear categoria ahora (opcional)
            </label>
            <input
              name="newCategoryName"
              value={formValues.newCategoryName}
              onChange={(event) =>
                setFormValues((previous) => ({ ...previous, newCategoryName: event.target.value }))
              }
              className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              placeholder="Past Simple"
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Contenido</p>
            <div className="mt-3">
              {hasInvalidJson ? (
                <div className="space-y-3">
                  <p className="text-sm text-danger">JSON invalido. Corrigelo abajo o restaura la plantilla base.</p>
                  <button
                    type="button"
                    onClick={() =>
                      setFormValues((previous) => ({
                        ...previous,
                        contentJson: toPrettyJson(getDefaultContent(previous.type)),
                      }))
                    }
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Restaurar plantilla de este tipo
                  </button>
                </div>
              ) : (
                <GuidedEditor
                  item={{ type: formValues.type }}
                  content={guidedContent}
                  onPatch={updateGuidedContent}
                />
              )}
            </div>
          </div>

          <details className="rounded-2xl border border-border bg-surface px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
              Modo avanzado (JSON)
            </summary>
            <div className="mt-3 space-y-2">
              <textarea
                name="contentJson"
                rows={10}
                value={formValues.contentJson}
                onChange={(event) => setFormValues((previous) => ({ ...previous, contentJson: event.target.value }))}
                className={`w-full rounded-2xl border px-3 py-2 font-mono text-xs ${
                  hasInvalidJson
                    ? "border-danger/60 bg-danger/5 text-danger"
                    : "border-border bg-surface-2 text-foreground"
                }`}
              />
              <p className="text-xs text-muted">
                {hasInvalidJson ? "Corrige el JSON antes de guardar." : "JSON valido."}
              </p>
            </div>
          </details>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || hasInvalidJson}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending
                ? "Guardando..."
                : formValues.exerciseId
                ? "Guardar cambios"
                : "Crear ejercicio"}
            </button>
          </div>
        </form>
      </div>
    </AppModal>
  );
}
