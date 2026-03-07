"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import AppModal from "@/components/app-modal";
import {
  duplicateExerciseLibraryEntry,
  saveCourseSessionExerciseBatch,
  saveTemplateSessionExerciseBatch,
} from "@/app/admin/actions";
import {
  EXERCISE_LIBRARY_LEVELS,
  EXERCISE_LIBRARY_SKILLS,
  buildExerciseLibrarySummary,
  getExerciseCategoryLabel,
  getExerciseLibraryCategoryKey,
  matchesExerciseLibrarySearch,
} from "@/lib/exercise-library";

const INITIAL_STATE = {
  success: false,
  message: null,
  error: null,
  created: 0,
  savedAt: null,
};

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `exercise-assignment-${Date.now()}-${Math.random()}`;
}

function normalizePoints(value, fallback = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round((parsed + Number.EPSILON) * 100) / 100));
}

function createAssignmentDraft(row = {}) {
  return {
    localId: String(row?.localId || "").trim() || createLocalId(),
    itemId: String(row?.itemId || "").trim(),
    exerciseId: String(row?.exerciseId || row?.id || "").trim(),
    title: String(row?.title || "").trim(),
    prompt: String(row?.prompt || "").trim(),
    skill: String(row?.skill || "").trim(),
    cefrLevel: String(row?.cefrLevel || "").trim(),
    categoryId: String(row?.categoryId || "").trim(),
    categoryName: String(row?.categoryName || "").trim(),
    type: String(row?.type || "").trim(),
    typeLabel: String(row?.typeLabel || "").trim() || "Exercise",
    contentJson:
      row?.contentJson && typeof row.contentJson === "object" && !Array.isArray(row.contentJson)
        ? row.contentJson
        : {},
    points: normalizePoints(row?.points ?? row?.exercisePoints, 10),
  };
}

function hydrateAssignmentDrafts(rows = [], previousAssignments = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const previousByItemId = new Map();
  const previousExerciseQueues = new Map();

  (Array.isArray(previousAssignments) ? previousAssignments : []).forEach((assignment) => {
    const localId = String(assignment?.localId || "").trim();
    if (!localId) return;

    const itemId = String(assignment?.itemId || "").trim();
    if (itemId && !previousByItemId.has(itemId)) {
      previousByItemId.set(itemId, localId);
    }

    const exerciseId = String(assignment?.exerciseId || "").trim();
    if (exerciseId) {
      const queue = previousExerciseQueues.get(exerciseId) || [];
      queue.push(localId);
      previousExerciseQueues.set(exerciseId, queue);
    }
  });

  return safeRows.map((row) => {
    const itemId = String(row?.itemId || "").trim();
    const exerciseId = String(row?.exerciseId || row?.id || "").trim();
    let localId = "";

    if (itemId && previousByItemId.has(itemId)) {
      localId = previousByItemId.get(itemId) || "";
    } else if (exerciseId) {
      const queue = previousExerciseQueues.get(exerciseId) || [];
      localId = queue.shift() || "";
      previousExerciseQueues.set(exerciseId, queue);
    }

    return createAssignmentDraft({
      ...row,
      localId,
    });
  });
}

function applyPersistedAssignments(previousAssignments = [], persistedAssignments = []) {
  const safePrevious = Array.isArray(previousAssignments) ? previousAssignments : [];
  const safePersisted = [...(Array.isArray(persistedAssignments) ? persistedAssignments : [])]
    .map((row) => ({
      itemId: String(row?.itemId || "").trim(),
      exerciseId: String(row?.exerciseId || "").trim(),
      points: normalizePoints(row?.points, 10),
      order: Number(row?.order || 0),
    }))
    .filter((row) => row.itemId && row.exerciseId)
    .sort((left, right) => left.order - right.order);

  if (!safePersisted.length) return safePrevious;

  if (safePersisted.length === safePrevious.length) {
    return safePrevious.map((assignment, index) => {
      const persisted = safePersisted[index];
      if (!persisted) return assignment;
      return {
        ...assignment,
        itemId: persisted.itemId,
        exerciseId: persisted.exerciseId,
        points: normalizePoints(persisted.points, assignment.points),
      };
    });
  }

  const queuesByExerciseId = new Map();
  safePersisted.forEach((row) => {
    const queue = queuesByExerciseId.get(row.exerciseId) || [];
    queue.push(row);
    queuesByExerciseId.set(row.exerciseId, queue);
  });

  return safePrevious.map((assignment) => {
    const exerciseId = String(assignment?.exerciseId || "").trim();
    const queue = queuesByExerciseId.get(exerciseId) || [];
    const persisted = queue.shift() || null;
    queuesByExerciseId.set(exerciseId, queue);
    if (!persisted) return assignment;
    return {
      ...assignment,
      itemId: persisted.itemId,
      exerciseId: persisted.exerciseId,
      points: normalizePoints(persisted.points, assignment.points),
    };
  });
}

function moveArrayItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return list;
  next.splice(toIndex, 0, moved);
  return next;
}

function sortCategories(list = []) {
  return [...(Array.isArray(list) ? list : [])].sort((left, right) =>
    String(left?.name || "").localeCompare(String(right?.name || ""), "en", { sensitivity: "base" })
  );
}

function FolderIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function SessionExerciseLibraryEditor({
  scope = "template",
  templateId = "",
  templateSessionId = "",
  commissionId = "",
  courseSessionId = "",
  initialAssignments = [],
  initialQuizTitle = "",
  libraryExercises = [],
  libraryCategories = [],
  libraryError = "",
}) {
  const submitAction = scope === "commission" ? saveCourseSessionExerciseBatch : saveTemplateSessionExerciseBatch;
  const [state, formAction, pending] = useActionState(submitAction, INITIAL_STATE);
  const [quizTitle, setQuizTitle] = useState(() => String(initialQuizTitle || "Prueba de clase").trim() || "Prueba de clase");
  const [assignments, setAssignments] = useState(() =>
    hydrateAssignmentDrafts(initialAssignments, [])
  );
  const [clientNotice, setClientNotice] = useState("");
  const [clientError, setClientError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSkill, setPickerSkill] = useState("");
  const [pickerLevel, setPickerLevel] = useState("");
  const [pickerCategoryId, setPickerCategoryId] = useState("");
  const [pickerSelection, setPickerSelection] = useState([]);
  const [pickerPreviewId, setPickerPreviewId] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const initialHydrationKeyRef = useRef("");
  const hydratedStateKeyRef = useRef("");

  useEffect(() => {
    const safeRows = Array.isArray(initialAssignments) ? initialAssignments : [];
    const hydrationKey = JSON.stringify({
      title: String(initialQuizTitle || "").trim(),
      rows: safeRows.map((row) => ({
        itemId: String(row?.itemId || "").trim(),
        exerciseId: String(row?.exerciseId || row?.id || "").trim(),
        points: normalizePoints(row?.points ?? row?.exercisePoints, 10),
        order: Number(row?.exerciseOrder || row?.order || 0),
      })),
    });
    if (initialHydrationKeyRef.current === hydrationKey) return;
    initialHydrationKeyRef.current = hydrationKey;

    startTransition(() => {
      setQuizTitle(String(initialQuizTitle || "Prueba de clase").trim() || "Prueba de clase");
      setAssignments((previous) => hydrateAssignmentDrafts(safeRows, previous));
    });
  }, [initialAssignments, initialQuizTitle]);

  useEffect(() => {
    if (!state?.success) return;
    const hydrationKey = `${String(state?.message || "").trim()}|${Number(state?.created || 0)}|${Number(state?.updated || 0)}|${
      Array.isArray(state?.persistedAssignments) ? state.persistedAssignments.length : -1
    }|${String(state?.savedAt || "")}`;
    if (hydratedStateKeyRef.current === hydrationKey) return;
    hydratedStateKeyRef.current = hydrationKey;

    startTransition(() => {
      if (Array.isArray(state.persistedAssignments)) {
        setAssignments((previous) => applyPersistedAssignments(previous, state.persistedAssignments));
      } else if (Array.isArray(state.assignments)) {
        setAssignments((previous) => hydrateAssignmentDrafts(state.assignments, previous));
      }
      if (state.quizTitle) {
        setQuizTitle(String(state.quizTitle || "").trim() || "Prueba de clase");
      }
    });

  }, [state]);

  const selectedExerciseIds = useMemo(
    () => new Set(assignments.map((assignment) => String(assignment.exerciseId || "").trim()).filter(Boolean)),
    [assignments]
  );

  const pickerQueryMatches = useMemo(
    () =>
      (Array.isArray(libraryExercises) ? libraryExercises : []).filter((exercise) =>
        matchesExerciseLibrarySearch(exercise, pickerQuery)
      ),
    [libraryExercises, pickerQuery]
  );

  const pickerSkillMatches = useMemo(
    () => pickerQueryMatches.filter((exercise) => !pickerSkill || exercise.skill === pickerSkill),
    [pickerQueryMatches, pickerSkill]
  );

  const pickerLevelMatches = useMemo(
    () => pickerSkillMatches.filter((exercise) => !pickerLevel || exercise.cefrLevel === pickerLevel),
    [pickerLevel, pickerSkillMatches]
  );

  const pickerVisibleExercises = useMemo(
    () =>
      pickerLevelMatches.filter(
        (exercise) => !pickerCategoryId || getExerciseLibraryCategoryKey(exercise) === pickerCategoryId
      ),
    [pickerCategoryId, pickerLevelMatches]
  );

  const pickerPathExercises = useMemo(
    () =>
      (Array.isArray(libraryExercises) ? libraryExercises : []).filter(
        (exercise) =>
          (!pickerSkill || exercise.skill === pickerSkill) &&
          (!pickerLevel || exercise.cefrLevel === pickerLevel)
      ),
    [libraryExercises, pickerLevel, pickerSkill]
  );

  const pickerSkillFolders = useMemo(
    () =>
      EXERCISE_LIBRARY_SKILLS.map((skill) => ({
        ...skill,
        count: pickerQueryMatches.filter((exercise) => exercise.skill === skill.value).length,
      })),
    [pickerQueryMatches]
  );

  const pickerLevelFolders = useMemo(
    () =>
      EXERCISE_LIBRARY_LEVELS.map((level) => ({
        ...level,
        count: pickerSkillMatches.filter((exercise) => exercise.cefrLevel === level.value).length,
      })),
    [pickerSkillMatches]
  );

  const pickerCategoryFolders = useMemo(() => {
    const folderMap = new Map();

    sortCategories(
      (Array.isArray(libraryCategories) ? libraryCategories : []).filter(
        (category) =>
          (!pickerSkill || category.skill === pickerSkill) &&
          (!pickerLevel || category.cefrLevel === pickerLevel)
      )
    ).forEach((category) => {
      const key = getExerciseLibraryCategoryKey(category);
      folderMap.set(key, {
        key,
        name: getExerciseCategoryLabel(category?.name),
        count: 0,
      });
    });

    pickerPathExercises.forEach((exercise) => {
      const key = getExerciseLibraryCategoryKey(exercise);
      const current = folderMap.get(key) || {
        key,
        name: getExerciseCategoryLabel(exercise?.categoryName),
        count: 0,
      };
      folderMap.set(key, current);
    });

    pickerLevelMatches.forEach((exercise) => {
      const key = getExerciseLibraryCategoryKey(exercise);
      const current = folderMap.get(key) || {
        key,
        name: getExerciseCategoryLabel(exercise?.categoryName),
        count: 0,
      };
      current.count += 1;
      folderMap.set(key, current);
    });

    return [...folderMap.values()].sort((left, right) =>
      String(left?.name || "").localeCompare(String(right?.name || ""), "en", { sensitivity: "base" })
    );
  }, [libraryCategories, pickerLevel, pickerLevelMatches, pickerPathExercises, pickerSkill]);

  const pickerAtSkillRoot = !pickerSkill;
  const pickerAtLevelRoot = Boolean(pickerSkill && !pickerLevel);
  const pickerAtCategoryRoot = Boolean(pickerSkill && pickerLevel && !pickerCategoryId);
  const pickerAtExerciseRoot = Boolean(pickerSkill && pickerLevel && pickerCategoryId);

  const previewExercise = useMemo(() => {
    const selectedPreviewId =
      pickerPreviewId || pickerSelection[0] || (pickerAtExerciseRoot ? pickerVisibleExercises[0]?.id : "") || "";
    if (!selectedPreviewId) return null;
    return (libraryExercises || []).find(
      (exercise) => String(exercise?.id || "").trim() === String(selectedPreviewId || "").trim()
    ) || null;
  }, [libraryExercises, pickerAtExerciseRoot, pickerPreviewId, pickerSelection, pickerVisibleExercises]);

  const batchJson = useMemo(
    () =>
      JSON.stringify(
        assignments.map((assignment, index) => ({
          itemId: assignment.itemId,
          exerciseId: assignment.exerciseId,
          points: assignment.points,
          order: index + 1,
        }))
      ),
    [assignments]
  );

  function openPicker() {
    setPickerQuery("");
    setPickerSkill("");
    setPickerLevel("");
    setPickerCategoryId("");
    setPickerSelection([]);
    setPickerPreviewId("");
    setPickerOpen(true);
  }

  function resetPickerToSkillRoot() {
    setPickerSkill("");
    setPickerLevel("");
    setPickerCategoryId("");
    setPickerPreviewId("");
  }

  function openPickerSkillFolder(skillValue) {
    setPickerSkill(skillValue);
    setPickerLevel("");
    setPickerCategoryId("");
    setPickerPreviewId("");
  }

  function openPickerLevelFolder(levelValue) {
    setPickerLevel(levelValue);
    setPickerCategoryId("");
    setPickerPreviewId("");
  }

  function openPickerCategoryFolder(categoryKey) {
    setPickerCategoryId(categoryKey);
    setPickerPreviewId("");
  }

  function goUpPickerLevel() {
    if (pickerCategoryId) {
      setPickerCategoryId("");
      setPickerPreviewId("");
      return;
    }
    if (pickerLevel) {
      setPickerLevel("");
      setPickerPreviewId("");
      return;
    }
    if (pickerSkill) {
      resetPickerToSkillRoot();
    }
  }

  function togglePickerSelection(exerciseId) {
    setPickerSelection((previous) => {
      const safeId = String(exerciseId || "").trim();
      if (!safeId) return previous;
      if (previous.includes(safeId)) {
        return previous.filter((value) => value !== safeId);
      }
      return [...previous, safeId];
    });
    setPickerPreviewId(String(exerciseId || "").trim());
  }

  function confirmPickerSelection() {
    const selectedRows = (libraryExercises || []).filter((exercise) =>
      pickerSelection.includes(String(exercise.id || "").trim())
    );
    let appendedCount = 0;
    setAssignments((previous) => {
      const previousIds = new Set(previous.map((assignment) => String(assignment.exerciseId || "").trim()).filter(Boolean));
      const appendedRows = selectedRows
        .filter((exercise) => {
          const exerciseId = String(exercise?.id || "").trim();
          if (!exerciseId || previousIds.has(exerciseId)) return false;
          previousIds.add(exerciseId);
          return true;
        })
        .map((exercise) =>
          createAssignmentDraft({
            ...exercise,
            exerciseId: exercise.id,
            points: 10,
          })
        );
      appendedCount = appendedRows.length;
      return [...previous, ...appendedRows];
    });

    setClientError("");
    setClientNotice(
      appendedCount > 0
        ? `${appendedCount} ejercicio(s) agregados desde la biblioteca.`
        : "Los ejercicios seleccionados ya estaban agregados."
    );
    setPickerOpen(false);
  }

  function removeAssignment(localId) {
    setAssignments((previous) => previous.filter((assignment) => assignment.localId !== localId));
  }

  function moveAssignment(localId, direction) {
    setAssignments((previous) => {
      const currentIndex = previous.findIndex((assignment) => assignment.localId === localId);
      if (currentIndex === -1) return previous;
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= previous.length) return previous;
      return moveArrayItem(previous, currentIndex, targetIndex);
    });
  }

  function updateAssignmentPoints(localId, nextValue) {
    setAssignments((previous) =>
      previous.map((assignment) =>
        assignment.localId === localId
          ? { ...assignment, points: normalizePoints(nextValue, assignment.points) }
          : assignment
      )
    );
  }

  function handleDuplicateAndSwap(localId, exerciseId) {
    if (!localId || !exerciseId || busyKey) return;

    setBusyKey(`swap:${localId}`);
    setClientError("");
    setClientNotice("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("exerciseId", exerciseId);
      try {
        const result = await duplicateExerciseLibraryEntry(null, formData);
        if (result?.success && result?.exercise) {
          setAssignments((previous) =>
            previous.map((assignment) =>
              assignment.localId === localId
                ? {
                    ...assignment,
                    exerciseId: result.exercise.id,
                    title: result.exercise.title,
                    prompt: result.exercise.prompt,
                    skill: result.exercise.skill,
                    cefrLevel: result.exercise.cefrLevel,
                    categoryId: result.exercise.categoryId,
                    categoryName: result.exercise.categoryName,
                    type: result.exercise.type,
                    typeLabel: result.exercise.typeLabel,
                    contentJson: result.exercise.contentJson,
                    itemId: "",
                  }
                : assignment
            )
          );
          setClientNotice("Se creo una copia en la biblioteca y esta prueba ahora usa esa copia.");
        } else {
          setClientError(result?.error || "No se pudo duplicar el ejercicio.");
        }
      } catch {
        setClientError("No se pudo duplicar el ejercicio.");
      }
      setBusyKey("");
    });
  }

  return (
    <div className="space-y-6">
      {state?.error ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {state.message}
        </p>
      ) : null}
      {libraryError ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {libraryError}
        </p>
      ) : null}
      {clientError ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {clientError}
        </p>
      ) : null}
      {clientNotice ? (
        <p className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {clientNotice}
        </p>
      ) : null}

      <form
        action={formAction}
        className="space-y-6"
      >
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="templateSessionId" value={templateSessionId} />
        <input type="hidden" name="commissionId" value={commissionId} />
        <input type="hidden" name="courseSessionId" value={courseSessionId} />
        <input type="hidden" name="batchJson" value={batchJson} />

        <div className="grid gap-4 rounded-3xl border border-border bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Titulo de la prueba</label>
              <input
                name="quizTitle"
                value={quizTitle}
                onChange={(event) => setQuizTitle(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                placeholder="Prueba de clase"
                required
              />
            </div>

            <div className="rounded-2xl border border-border bg-surface-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Exercise Library</p>
              <p className="mt-2 text-sm text-muted">
                Esta prueba ya no crea ejercicios inline. Selecciona ejercicios guardados desde la biblioteca central y
                asigna los puntos por instancia aqui.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openPicker}
                  disabled={!libraryExercises.length}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Agregar ejercicio
                </button>
                <Link
                  href="/admin/exercises"
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                >
                  Abrir biblioteca
                </Link>
                <button
                  type="button"
                  onClick={() => setAssignments([])}
                  className="rounded-xl border border-danger/45 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10"
                >
                  Vaciar prueba
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Resumen</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{assignments.length}</p>
            <p className="text-sm text-muted">ejercicio(s) asignados</p>
            <p className="mt-4 text-xs text-muted">
              Los puntos se guardan por referencia. Editarlos aqui no modifica el ejercicio original de la biblioteca.
            </p>
            <button
              type="submit"
              disabled={pending || !assignments.length}
              className="mt-5 inline-flex w-full justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? "Guardando..." : "Guardar prueba"}
            </button>
          </div>
        </div>
      </form>

      {assignments.length ? (
        <div className="space-y-4">
          {assignments.map((assignment, index) => {
            const currentBusy = busyKey === `swap:${assignment.localId}`;
            const summary = buildExerciseLibrarySummary(assignment);

            return (
              <section
                key={`${assignment.exerciseId || "exercise"}-${assignment.localId}`}
                className="rounded-3xl border border-border bg-surface p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                      #{index + 1}
                    </span>
                    <span className="rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                      {assignment.skill}
                    </span>
                    <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                      {assignment.cefrLevel}
                    </span>
                    <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                      {getExerciseCategoryLabel(assignment.categoryName)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => moveAssignment(assignment.localId, "up")}
                      disabled={index === 0}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAssignment(assignment.localId, "down")}
                      disabled={index === assignments.length - 1}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Bajar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAssignment(assignment.localId)}
                      className="rounded-xl border border-danger/45 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10"
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="space-y-3 rounded-3xl border border-border bg-surface-2 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Titulo</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{assignment.title}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Tipo</p>
                      <p className="mt-1 text-sm text-muted">{assignment.typeLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Preview</p>
                      <p className="mt-1 text-sm text-muted">{summary || "Sin resumen visible."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/exercises?edit=${assignment.exerciseId}`}
                        className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                      >
                        Editar en biblioteca
                      </Link>
                      <button
                        type="button"
                        disabled={currentBusy}
                        onClick={() => handleDuplicateAndSwap(assignment.localId, assignment.exerciseId)}
                        className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {currentBusy ? "Duplicando..." : "Duplicar y usar copia"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-3xl border border-border bg-surface-2 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Puntos</p>
                      <p className="mt-1 text-sm text-muted">
                        Peso de esta instancia dentro de la prueba. El calculo final sigue normalizando a 100.
                      </p>
                    </div>

                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={assignment.points}
                      onChange={(event) => updateAssignmentPoints(assignment.localId, event.target.value)}
                      className="w-full rounded-2xl border border-border bg-surface px-3 py-3 text-lg font-semibold text-foreground"
                    />
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-foreground">No hay ejercicios en esta prueba</p>
          <p className="mt-2 text-sm text-muted">
            Usa el selector para agregar ejercicios desde la Exercise Library.
          </p>
        </div>
      )}

      <AppModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Agregar ejercicios"
        widthClass="max-w-6xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Exercise Library</p>
              <p className="text-xs text-muted">
                Busca, filtra por carpetas y selecciona varios ejercicios para agregarlos a esta prueba.
              </p>
            </div>
            <div className="text-xs font-semibold text-muted">Seleccionados: {pickerSelection.length}</div>
          </div>

          <input
            value={pickerQuery}
            onChange={(event) => setPickerQuery(event.target.value)}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
            placeholder="Buscar por titulo, categoria, skill o nivel"
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="space-y-4 rounded-2xl border border-border bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={resetPickerToSkillRoot}
                      className={`rounded-full px-3 py-1 transition ${
                        pickerAtSkillRoot
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface text-foreground hover:bg-background"
                      }`}
                    >
                      Biblioteca
                    </button>
                    {pickerSkill ? (
                      <>
                        <ChevronRightIcon />
                        <button
                          type="button"
                          onClick={() => {
                            setPickerLevel("");
                            setPickerCategoryId("");
                            setPickerPreviewId("");
                          }}
                          className={`rounded-full px-3 py-1 transition ${
                            pickerAtLevelRoot
                              ? "bg-primary text-primary-foreground"
                              : "bg-surface text-foreground hover:bg-background"
                          }`}
                        >
                          {EXERCISE_LIBRARY_SKILLS.find((item) => item.value === pickerSkill)?.label || pickerSkill}
                        </button>
                      </>
                    ) : null}
                    {pickerLevel ? (
                      <>
                        <ChevronRightIcon />
                        <button
                          type="button"
                          onClick={() => {
                            setPickerCategoryId("");
                            setPickerPreviewId("");
                          }}
                          className={`rounded-full px-3 py-1 transition ${
                            pickerAtCategoryRoot
                              ? "bg-primary text-primary-foreground"
                              : "bg-surface text-foreground hover:bg-background"
                          }`}
                        >
                          {pickerLevel}
                        </button>
                      </>
                    ) : null}
                    {pickerCategoryId ? (
                      <>
                        <ChevronRightIcon />
                        <span className="rounded-full bg-primary px-3 py-1 text-primary-foreground">
                          {pickerCategoryFolders.find((item) => item.key === pickerCategoryId)?.name || "Categoria"}
                        </span>
                      </>
                    ) : null}
                  </div>

                  {!pickerAtSkillRoot ? (
                    <button
                      type="button"
                      onClick={goUpPickerLevel}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                    >
                      Subir carpeta
                    </button>
                  ) : null}
                </div>

                <p className="text-sm text-muted">
                  {pickerAtSkillRoot
                    ? "Abre primero una carpeta de Skill."
                    : pickerAtLevelRoot
                    ? "Ahora abre uno de los niveles CEFR."
                    : pickerAtCategoryRoot
                    ? "Ahora abre una categoria."
                    : "Selecciona uno o varios ejercicios guardados dentro de esta carpeta."}
                </p>

                {pickerAtSkillRoot ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {pickerSkillFolders.map((skill) => (
                      <button
                        key={skill.value}
                        type="button"
                        onClick={() => openPickerSkillFolder(skill.value)}
                        className="rounded-3xl border border-border bg-surface p-4 text-left transition hover:border-primary/35 hover:bg-background"
                      >
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <FolderIcon />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{skill.label}</p>
                            <p className="text-xs text-muted">{skill.count} ejercicio(s)</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {pickerAtLevelRoot ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {pickerLevelFolders.map((level) => (
                      <button
                        key={level.value}
                        type="button"
                        onClick={() => openPickerLevelFolder(level.value)}
                        className="rounded-3xl border border-border bg-surface p-4 text-left transition hover:border-primary/35 hover:bg-background"
                      >
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <FolderIcon />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{level.label}</p>
                            <p className="text-xs text-muted">{level.count} ejercicio(s)</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {pickerAtCategoryRoot ? (
                  pickerCategoryFolders.length ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {pickerCategoryFolders.map((category) => (
                        <button
                          key={category.key}
                          type="button"
                          onClick={() => openPickerCategoryFolder(category.key)}
                          className="rounded-3xl border border-border bg-surface p-4 text-left transition hover:border-primary/35 hover:bg-background"
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                              <FolderIcon />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{category.name}</p>
                              <p className="text-xs text-muted">{category.count} ejercicio(s)</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
                      No hay categorias en esta carpeta.
                    </div>
                  )
                ) : null}

                {pickerAtExerciseRoot ? (
                  pickerVisibleExercises.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {pickerVisibleExercises.map((exercise) => {
                        const exerciseId = String(exercise.id || "").trim();
                        const selected = pickerSelection.includes(exerciseId);
                        const alreadyAdded = selectedExerciseIds.has(exerciseId);

                        return (
                          <button
                            key={exerciseId}
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => togglePickerSelection(exerciseId)}
                            onMouseEnter={() => setPickerPreviewId(exerciseId)}
                            className={`rounded-3xl border p-4 text-left transition ${
                              alreadyAdded
                                ? "cursor-not-allowed border-border bg-surface opacity-55"
                                : selected
                                ? "border-primary/50 bg-primary/10"
                                : "border-border bg-surface hover:border-primary/35 hover:bg-background"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                {exercise.skill}
                              </span>
                              <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                                {exercise.cefrLevel}
                              </span>
                            </div>
                            <p className="mt-3 text-sm font-semibold text-foreground">{exercise.title}</p>
                            <p className="mt-1 text-xs text-muted">{exercise.typeLabel}</p>
                            <p className="mt-2 text-xs text-muted">{getExerciseCategoryLabel(exercise.categoryName)}</p>
                            <p className="mt-2 text-xs text-muted">
                              {alreadyAdded ? "Ya agregado a esta prueba" : selected ? "Listo para agregar" : "Seleccionar"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
                      Esta carpeta esta vacia o la busqueda no encontro coincidencias.
                    </div>
                  )
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-surface-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Preview</p>
              {previewExercise ? (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {previewExercise.skill}
                    </span>
                    <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">
                      {previewExercise.cefrLevel}
                    </span>
                    <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">
                      {getExerciseCategoryLabel(previewExercise.categoryName)}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">{previewExercise.title}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      {previewExercise.typeLabel}
                    </p>
                  </div>
                  <p className="text-sm text-muted">{buildExerciseLibrarySummary(previewExercise) || "Sin resumen visible."}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">Selecciona un ejercicio para ver el preview.</p>
              )}

              <div className="mt-5 rounded-2xl border border-border bg-surface p-3 text-xs text-muted">
                Si necesitas cambiar el contenido, abre la Exercise Library y editalo alli. Desde esta prueba solo
                eliges referencias y sus puntos.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmPickerSelection}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              Agregar seleccionados
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
