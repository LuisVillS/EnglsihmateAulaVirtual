"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  deleteExerciseLibraryEntry,
  duplicateExerciseLibraryEntry,
  upsertExerciseLibraryEntry,
} from "@/app/admin/actions";
import AppModal from "@/components/app-modal";
import ExerciseLibraryEditorModal from "@/components/exercise-library-editor-modal";
import {
  normalizeContent,
  toPrettyJson,
} from "@/components/template-session-exercise-builder";
import { isPublishableExercise } from "@/lib/duolingo/validation";
import {
  EXERCISE_LIBRARY_LEVELS,
  EXERCISE_LIBRARY_SKILLS,
  buildExerciseLibrarySummary,
  getExerciseCategoryLabel,
  getExerciseDisplayTitle,
  getExerciseLibraryCategoryKey,
  matchesExerciseLibrarySearch,
  sortExerciseLibrary,
} from "@/lib/exercise-library";
import { tokenizeClozeSentence } from "@/lib/cloze-blanks";

function sortCategories(list = []) {
  return [...(Array.isArray(list) ? list : [])].sort((left, right) => {
    const skillCompare = String(left?.skill || "").localeCompare(String(right?.skill || ""));
    if (skillCompare !== 0) return skillCompare;

    const levelCompare = String(left?.cefrLevel || "").localeCompare(String(right?.cefrLevel || ""));
    if (levelCompare !== 0) return levelCompare;

    return String(left?.name || "").localeCompare(String(right?.name || ""), "en", {
      sensitivity: "base",
    });
  });
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

const CSV_TEMPLATE_TYPES = [
  { value: "cloze", label: "Completar espacios" },
  { value: "scramble", label: "Ordenar oracion" },
  { value: "pairs", label: "Juego de pares" },
  { value: "image_match", label: "Imagen y palabra" },
  { value: "audio_match", label: "Match de audio" },
  { value: "reading_exercise", label: "Lectura" },
];

const CSV_TEMPLATE_FILES = {
  cloze: [
    "skill,cefr_level,category,sentence,answers,options",
    'grammar,A1,Verb To Be,"I [Blank] a student and you [Blank] a teacher.","am|are","am|is|are|be"',
  ].join("\n"),
  scramble: [
    "skill,cefr_level,category,prompt_native,target_words",
    '"grammar",A1,Basic Order,"Yo soy estudiante","I|am|a|student"',
  ].join("\n"),
  pairs: [
    "skill,cefr_level,category,pairs_title,pairs",
    '"vocabulary",A2,Food,"Food Basics","Manzana=>Apple|Pan=>Bread"',
  ].join("\n"),
  image_match: [
    "skill,cefr_level,category,question_native,image_url,options,correct_index",
    '"vocabulary",A1,Animals,"Which word matches the image?","https://example.com/cat.jpg","cat|dog|bird|fish",0',
  ].join("\n"),
  audio_match: [
    "skill,cefr_level,category,listening_title,prompt_native,youtube_url,question_prompt,option_1,option_2,option_3,option_4,correct_index,max_plays",
    '"listening",A2,Daily Routines,"Morning Routine","Listen and choose the correct answer.","https://www.youtube.com/watch?v=demo","What time does he wake up?","At 6","At 7","At 8","At 9",1,2',
  ].join("\n"),
  reading_exercise: [
    "skill,cefr_level,category,reading_title,text,image_url,question_prompt,option_1,option_2,option_3,option_4,correct_index",
    '"reading",B1,Travel,"A Trip to Lima","Maria visits Lima for three days and explores the city.","","How long is the trip?","One day","Two days","Three days","Four days",2',
  ].join("\n"),
};

function downloadCsvTemplate(type) {
  const csv = CSV_TEMPLATE_FILES[type];
  if (!csv || typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${type}-template.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const normalizedRows = rows
    .map((currentRow) => currentRow.map((value) => String(value ?? "").trim()))
    .filter((currentRow) => currentRow.some((value) => value));

  const headers = normalizedRows[0]?.map((value) => value.toLowerCase()) || [];
  const bodyRows = normalizedRows.slice(1);

  return { headers, rows: bodyRows };
}

function splitPipeList(value) {
  return String(value || "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildCsvImportPreview(type, text) {
  const { headers, rows } = parseCsvText(text);
  if (!headers.length) {
    return [];
  }

  return rows.map((cells, index) => {
    const getCell = (key) => {
      const headerIndex = headers.indexOf(String(key || "").toLowerCase());
      if (headerIndex === -1) return "";
      return String(cells[headerIndex] || "").trim();
    };

    const skill = getCell("skill") || "grammar";
    const cefrLevel = getCell("cefr_level") || "A1";
    const categoryName = getCell("category");

    try {
      let rawContent = {};

      if (type === "cloze") {
        const answers = splitPipeList(getCell("answers"));
        const optionTexts = splitPipeList(getCell("options"));
        const blanks = answers.map((answer, answerIndex) => {
          const blankId = `blank_csv_${index + 1}_${answerIndex + 1}`;
          const existingOptionIndex = optionTexts.findIndex(
            (option) => option.toLowerCase() === answer.toLowerCase()
          );
          const optionIndex = existingOptionIndex >= 0 ? existingOptionIndex : optionTexts.push(answer) - 1;
          const optionId = `opt_csv_${index + 1}_${optionIndex + 1}`;
          return {
            id: blankId,
            correct_option_id: optionId,
          };
        });
        rawContent = {
          sentence: tokenizeClozeSentence(getCell("sentence"), blanks.map((blank) => blank.id)).sentence,
          blanks,
          options_pool: optionTexts.map((option, optionIndex) => ({
            id: `opt_csv_${index + 1}_${optionIndex + 1}`,
            text: option,
          })),
        };
      } else if (type === "scramble") {
        const targetWords = splitPipeList(getCell("target_words"));
        rawContent = {
          prompt_native: getCell("prompt_native"),
          target_words: targetWords,
          answer_order: targetWords.map((_, wordIndex) => wordIndex),
        };
      } else if (type === "pairs") {
        const pairs = splitPipeList(getCell("pairs")).map((entry, pairIndex) => {
          const [native, target] = entry.split("=>");
          return {
            id: `pair_csv_${index + 1}_${pairIndex + 1}`,
            native: String(native || "").trim(),
            target: String(target || "").trim(),
          };
        });
        rawContent = {
          pairs_title: getCell("pairs_title"),
          pairs,
        };
      } else if (type === "image_match") {
        const options = splitPipeList(getCell("options")).slice(0, 4);
        rawContent = {
          question_native: getCell("question_native"),
          image_url: getCell("image_url"),
          options: Array.from({ length: 4 }, (_, optionIndex) => ({
            label: options[optionIndex] || "",
            vocab_id: "",
          })),
          correct_index: Number.parseInt(getCell("correct_index") || "0", 10),
        };
      } else if (type === "audio_match") {
        rawContent = {
          listening_title: getCell("listening_title"),
          prompt_native: getCell("prompt_native"),
          youtube_url: getCell("youtube_url"),
          max_plays: Number.parseInt(getCell("max_plays") || "2", 10),
          questions: [
            {
              id: `q_csv_${index + 1}`,
              type: "multiple_choice",
              prompt: getCell("question_prompt"),
              options: [
                getCell("option_1"),
                getCell("option_2"),
                getCell("option_3"),
                getCell("option_4"),
              ],
              correct_index: Number.parseInt(getCell("correct_index") || "0", 10),
            },
          ],
        };
      } else if (type === "reading_exercise") {
        rawContent = {
          title: getCell("reading_title"),
          reading_title: getCell("reading_title"),
          text: getCell("text"),
          image_url: getCell("image_url"),
          questions: [
            {
              id: `q_csv_${index + 1}`,
              type: "multiple_choice",
              prompt: getCell("question_prompt"),
              options: [
                getCell("option_1"),
                getCell("option_2"),
                getCell("option_3"),
                getCell("option_4"),
              ],
              correct_index: Number.parseInt(getCell("correct_index") || "0", 10),
            },
          ],
        };
      }

      const contentJson = normalizeContent(type, rawContent);
      const validation = isPublishableExercise({ type, contentJson });
      const displayTitle = getExerciseDisplayTitle(type, contentJson, "");

      return {
        index: index + 1,
        valid: validation.publishable,
        message: validation.publishable
          ? "Fila valida."
          : (validation.errors.join(" ") || "Fila invalida."),
        skill,
        cefrLevel,
        categoryName,
        type,
        title: displayTitle,
        contentJson,
      };
    } catch (error) {
      return {
        index: index + 1,
        valid: false,
        message: error?.message || "No se pudo interpretar la fila.",
        skill,
        cefrLevel,
        categoryName,
        type,
        title: "",
        contentJson: null,
      };
    }
  });
}

function buildCategoryFolders({ categories, exercises, activeSkill, activeLevel, levelMatches }) {
  const folderMap = new Map();

  (Array.isArray(categories) ? categories : [])
    .filter(
      (category) =>
        (!activeSkill || category.skill === activeSkill) &&
        (!activeLevel || category.cefrLevel === activeLevel)
    )
    .forEach((category) => {
      const key = getExerciseLibraryCategoryKey(category);
      folderMap.set(key, {
        key,
        name: getExerciseCategoryLabel(category?.name),
        count: 0,
      });
    });

  (Array.isArray(exercises) ? exercises : []).forEach((exercise) => {
    const key = getExerciseLibraryCategoryKey(exercise);
      const current = folderMap.get(key) || {
        key,
        name: getExerciseCategoryLabel(exercise?.categoryName),
        count: 0,
      };
    folderMap.set(key, current);
  });

  (Array.isArray(levelMatches) ? levelMatches : []).forEach((exercise) => {
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
}

export default function ExerciseLibraryManager({
  initialExercises = [],
  initialCategories = [],
  initialEditId = "",
}) {
  const [exercises, setExercises] = useState(() => sortExerciseLibrary(initialExercises));
  const [categories, setCategories] = useState(() => sortCategories(initialCategories));
  const [query, setQuery] = useState("");
  const [activeSkill, setActiveSkill] = useState("");
  const [activeLevel, setActiveLevel] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvType, setCsvType] = useState("");
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [csvSummary, setCsvSummary] = useState("");
  const [editingExercise, setEditingExercise] = useState(null);
  const [clientError, setClientError] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [didAutoOpen, setDidAutoOpen] = useState(false);

  useEffect(() => {
    if (!initialEditId || didAutoOpen) return;
    const target = exercises.find((exercise) => String(exercise?.id || "").trim() === String(initialEditId).trim());
    if (!target) return;
    queueMicrotask(() => {
      setEditingExercise(target);
      setEditorOpen(true);
      setDidAutoOpen(true);
    });
  }, [didAutoOpen, exercises, initialEditId]);

  const queryMatches = useMemo(
    () => exercises.filter((exercise) => matchesExerciseLibrarySearch(exercise, query)),
    [exercises, query]
  );

  const skillMatches = useMemo(
    () => queryMatches.filter((exercise) => !activeSkill || exercise.skill === activeSkill),
    [queryMatches, activeSkill]
  );

  const levelMatches = useMemo(
    () => skillMatches.filter((exercise) => !activeLevel || exercise.cefrLevel === activeLevel),
    [skillMatches, activeLevel]
  );

  const categoryMatches = useMemo(
    () =>
      levelMatches.filter(
        (exercise) => !activeCategoryId || getExerciseLibraryCategoryKey(exercise) === activeCategoryId
      ),
    [activeCategoryId, levelMatches]
  );

  const pathExercises = useMemo(
    () =>
      exercises.filter(
        (exercise) =>
          (!activeSkill || exercise.skill === activeSkill) &&
          (!activeLevel || exercise.cefrLevel === activeLevel)
      ),
    [activeLevel, activeSkill, exercises]
  );

  const skillFolders = useMemo(
    () =>
      EXERCISE_LIBRARY_SKILLS.map((skill) => ({
        ...skill,
        count: queryMatches.filter((exercise) => exercise.skill === skill.value).length,
      })),
    [queryMatches]
  );

  const levelFolders = useMemo(
    () =>
      EXERCISE_LIBRARY_LEVELS.map((level) => ({
        ...level,
        count: skillMatches.filter((exercise) => exercise.cefrLevel === level.value).length,
      })),
    [skillMatches]
  );

  const categoryFolders = useMemo(
    () =>
      buildCategoryFolders({
        categories,
        exercises: pathExercises,
        activeSkill,
        activeLevel,
        levelMatches,
      }),
    [activeLevel, activeSkill, categories, levelMatches, pathExercises]
  );

  const atSkillRoot = !activeSkill;
  const atLevelRoot = Boolean(activeSkill && !activeLevel);
  const atCategoryRoot = Boolean(activeSkill && activeLevel && !activeCategoryId);
  const atExerciseRoot = Boolean(activeSkill && activeLevel && activeCategoryId);

  function resetToSkillRoot() {
    setActiveSkill("");
    setActiveLevel("");
    setActiveCategoryId("");
  }

  function openSkillFolder(skillValue) {
    setActiveSkill(skillValue);
    setActiveLevel("");
    setActiveCategoryId("");
  }

  function openLevelFolder(levelValue) {
    setActiveLevel(levelValue);
    setActiveCategoryId("");
  }

  function openCategoryFolder(categoryKey) {
    setActiveCategoryId(categoryKey);
  }

  function goUpOneLevel() {
    if (activeCategoryId) {
      setActiveCategoryId("");
      return;
    }
    if (activeLevel) {
      setActiveLevel("");
      return;
    }
    if (activeSkill) {
      resetToSkillRoot();
    }
  }

  function openCreate() {
    setClientError("");
    setClientMessage("");
    setEditingExercise(null);
    setEditorOpen(true);
  }

  function openCsvMenu() {
    setCsvOpen(true);
    setCsvType("");
    setCsvPreviewRows([]);
    setCsvSummary("");
  }

  function openEdit(exercise) {
    setClientError("");
    setClientMessage("");
    setEditingExercise(exercise);
    setEditorOpen(true);
  }

  function handleSaved(exercise, message) {
    setExercises((previous) => {
      const exists = previous.some((current) => String(current.id || "") === String(exercise.id || ""));
      const next = exists
        ? previous.map((current) => (String(current.id || "") === String(exercise.id || "") ? exercise : current))
        : [...previous, exercise];
      return sortExerciseLibrary(next);
    });

    setCategories((previous) => {
      const category = {
        id: exercise.categoryId,
        name: exercise.categoryName,
        skill: exercise.skill,
        cefrLevel: exercise.cefrLevel,
      };
      if (!String(category.id || "").trim() && !String(category.name || "").trim()) {
        return previous;
      }
      const exists = previous.some((current) => String(current.id || "") === String(category.id || ""));
      const next = exists ? previous : [...previous, category];
      return sortCategories(next);
    });

    setClientError("");
    setClientMessage(message || "Biblioteca actualizada.");
  }

  function handleDelete(exerciseId) {
    if (!exerciseId || busyKey) return;

    setBusyKey(`delete:${exerciseId}`);
    setClientError("");
    setClientMessage("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("exerciseId", exerciseId);
      try {
        const result = await deleteExerciseLibraryEntry(null, formData);
        if (result?.success) {
          setExercises((previous) =>
            previous.filter((exercise) => String(exercise.id || "") !== String(exerciseId))
          );
          setClientMessage(result.message || "Ejercicio eliminado.");
        } else {
          setClientError(result?.error || "No se pudo eliminar el ejercicio.");
        }
      } catch {
        setClientError("No se pudo eliminar el ejercicio.");
      }
      setBusyKey("");
    });
  }

  function handleDuplicate(exerciseId) {
    if (!exerciseId || busyKey) return;

    setBusyKey(`duplicate:${exerciseId}`);
    setClientError("");
    setClientMessage("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("exerciseId", exerciseId);
      try {
        const result = await duplicateExerciseLibraryEntry(null, formData);
        if (result?.success && result?.exercise) {
          setExercises((previous) => sortExerciseLibrary([...previous, result.exercise]));
          setCategories((previous) => {
            const category = {
              id: result.exercise.categoryId,
              name: result.exercise.categoryName,
              skill: result.exercise.skill,
              cefrLevel: result.exercise.cefrLevel,
            };
            if (!String(category.id || "").trim() && !String(category.name || "").trim()) {
              return previous;
            }
            const exists = previous.some((current) => String(current.id || "") === String(category.id || ""));
            return exists ? previous : sortCategories([...previous, category]);
          });
          setClientMessage(result.message || "Se creo una copia del ejercicio.");
        } else {
          setClientError(result?.error || "No se pudo duplicar el ejercicio.");
        }
      } catch {
        setClientError("No se pudo duplicar el ejercicio.");
      }
      setBusyKey("");
    });
  }

  async function handleCsvFileChange(event) {
    const file = event.target.files?.[0];
    if (!file || !csvType) return;

    const text = await file.text();
    const previewRows = buildCsvImportPreview(csvType, text);
    const validCount = previewRows.filter((row) => row.valid).length;
    const invalidCount = previewRows.length - validCount;

    setCsvPreviewRows(previewRows);
    setCsvSummary(
      previewRows.length
        ? `${validCount} fila(s) validas, ${invalidCount} con error.`
        : "No se encontraron filas para procesar."
    );

    event.target.value = "";
  }

  function selectCsvType(nextType) {
    setCsvType(nextType);
    setCsvPreviewRows([]);
    setCsvSummary("");
  }

  function goBackFromCsvType() {
    setCsvType("");
    setCsvPreviewRows([]);
    setCsvSummary("");
  }

  function handleImportValidCsvRows() {
    if (busyKey || !csvPreviewRows.some((row) => row.valid)) return;

    setBusyKey("csv-import");
    setClientError("");
    setClientMessage("");

    startTransition(async () => {
      let imported = 0;
      let failed = 0;
      let firstError = "";
      let nextExercises = exercises;
      let nextCategories = categories;

      for (const row of csvPreviewRows) {
        if (!row.valid || !row.contentJson) continue;

        const formData = new FormData();
        formData.set("type", row.type);
        formData.set("title", row.title || "");
        formData.set("skillTag", row.skill);
        formData.set("cefrLevel", row.cefrLevel);
        formData.set("categoryId", "");
        formData.set("newCategoryName", row.categoryName);
        formData.set("contentJson", toPrettyJson(row.contentJson));

        try {
          const result = await upsertExerciseLibraryEntry(null, formData);
          if (result?.success && result?.exercise) {
            imported += 1;
            nextExercises = sortExerciseLibrary([...nextExercises, result.exercise]);
            const nextCategory = {
              id: result.exercise.categoryId,
              name: result.exercise.categoryName,
              skill: result.exercise.skill,
              cefrLevel: result.exercise.cefrLevel,
            };
            if (!String(nextCategory.id || "").trim() && !String(nextCategory.name || "").trim()) {
              continue;
            }
            const alreadyExists = nextCategories.some(
              (current) => String(current?.id || "") === String(nextCategory.id || "")
            );
            if (!alreadyExists) {
              nextCategories = sortCategories([...nextCategories, nextCategory]);
            }
          } else {
            failed += 1;
            if (!firstError) {
              firstError = result?.error || `No se pudo importar la fila ${row.index}.`;
            }
          }
        } catch (error) {
          failed += 1;
          if (!firstError) {
            firstError = error?.message || `No se pudo importar la fila ${row.index}.`;
          }
        }
      }

      setExercises(nextExercises);
      setCategories(nextCategories);
      setBusyKey("");
      setCsvSummary(`${imported} fila(s) importadas, ${failed} con error.`);

      if (firstError) {
        setClientError(firstError);
      }
      if (imported) {
        setClientMessage(`${imported} ejercicio(s) importados desde CSV.`);
      }
    });
  }

  return (
    <div className="space-y-6">
      {clientError ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {clientError}
        </p>
      ) : null}
      {clientMessage ? (
        <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {clientMessage}
        </p>
      ) : null}

      <div className="grid gap-4 rounded-3xl border border-border bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Buscar</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              placeholder="Titulo, categoria, skill o nivel"
            />
          </div>
          <p className="text-sm text-muted">
            La biblioteca se navega por carpetas: habilidad, nivel CEFR, categoria y despues ejercicios.
          </p>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Biblioteca</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{exercises.length}</p>
          <p className="text-sm text-muted">ejercicio(s) registrados</p>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex w-full justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              Nuevo ejercicio
            </button>
            <button
              type="button"
              onClick={openCsvMenu}
              className="inline-flex w-full justify-center rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Importar CSV
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            <button
              type="button"
              onClick={resetToSkillRoot}
              className={`rounded-full px-3 py-1 transition ${
                atSkillRoot ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground hover:bg-surface"
              }`}
            >
              Biblioteca
            </button>
            {activeSkill ? (
              <>
                <ChevronRightIcon />
                <button
                  type="button"
                  onClick={() => {
                    setActiveLevel("");
                    setActiveCategoryId("");
                  }}
                  className={`rounded-full px-3 py-1 transition ${
                    atLevelRoot ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground hover:bg-surface"
                  }`}
                >
                  {EXERCISE_LIBRARY_SKILLS.find((item) => item.value === activeSkill)?.label || activeSkill}
                </button>
              </>
            ) : null}
            {activeLevel ? (
              <>
                <ChevronRightIcon />
                <button
                  type="button"
                  onClick={() => setActiveCategoryId("")}
                  className={`rounded-full px-3 py-1 transition ${
                    atCategoryRoot ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground hover:bg-surface"
                  }`}
                >
                  {activeLevel}
                </button>
              </>
            ) : null}
            {activeCategoryId ? (
              <>
                <ChevronRightIcon />
                <span className="rounded-full bg-primary px-3 py-1 text-primary-foreground">
                  {categoryFolders.find((item) => item.key === activeCategoryId)?.name || "Categoria"}
                </span>
              </>
            ) : null}
          </div>

          {!atSkillRoot ? (
            <button
              type="button"
              onClick={goUpOneLevel}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Subir carpeta
            </button>
          ) : null}
        </div>

        <p className="text-sm text-muted">
          {atSkillRoot
            ? "Abre una carpeta de habilidad."
            : atLevelRoot
            ? "Abre un nivel CEFR dentro de esta habilidad."
            : atCategoryRoot
            ? "Abre una categoria para ver los ejercicios guardados."
            : "Estos son los ejercicios guardados dentro de esta categoria."}
        </p>

        {atSkillRoot ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {skillFolders.map((skill) => (
              <button
                key={skill.value}
                type="button"
                onClick={() => openSkillFolder(skill.value)}
                className="rounded-3xl border border-border bg-surface-2 p-5 text-left transition hover:border-primary/40 hover:bg-surface"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FolderIcon />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-foreground">{skill.label}</p>
                    <p className="text-xs text-muted">{skill.count} ejercicio(s)</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {atLevelRoot ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {levelFolders.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => openLevelFolder(level.value)}
                className="rounded-3xl border border-border bg-surface-2 p-5 text-left transition hover:border-primary/40 hover:bg-surface"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FolderIcon />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-foreground">{level.label}</p>
                    <p className="text-xs text-muted">{level.count} ejercicio(s)</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {atCategoryRoot ? (
          categoryFolders.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {categoryFolders.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => openCategoryFolder(category.key)}
                  className="rounded-3xl border border-border bg-surface-2 p-5 text-left transition hover:border-primary/40 hover:bg-surface"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <FolderIcon />
                    </span>
                    <div>
                            <p className="text-base font-semibold text-foreground">{category.name}</p>
                      <p className="text-xs text-muted">{category.count} ejercicio(s)</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-surface-2 p-8 text-center">
              <p className="text-lg font-semibold text-foreground">No hay categorias en esta carpeta</p>
              <p className="mt-2 text-sm text-muted">
                Crea el primer ejercicio dentro de esta habilidad y nivel para generar categorias.
              </p>
            </div>
          )
        ) : null}

        {atExerciseRoot ? (
          categoryMatches.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {categoryMatches.map((exercise) => {
                const currentBusy = busyKey === `delete:${exercise.id}` || busyKey === `duplicate:${exercise.id}`;
                const summary = buildExerciseLibrarySummary(exercise);

                return (
                  <article
                    key={exercise.id}
                    className="rounded-3xl border border-border bg-surface p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
                        {exercise.skill}
                      </span>
                      <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
                        {exercise.cefrLevel}
                      </span>
                      <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
                        {getExerciseCategoryLabel(exercise.categoryName)}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-lg font-semibold text-foreground">{exercise.title}</p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{exercise.typeLabel}</p>
                      <p className="text-sm text-muted">{summary || "Sin resumen visible."}</p>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(exercise)}
                        className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={currentBusy}
                        onClick={() => handleDuplicate(exercise.id)}
                        className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyKey === `duplicate:${exercise.id}` ? "Duplicando..." : "Duplicar"}
                      </button>
                      <button
                        type="button"
                        disabled={currentBusy}
                        onClick={() => handleDelete(exercise.id)}
                        className="flex-1 rounded-xl border border-danger/45 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyKey === `delete:${exercise.id}` ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-surface-2 p-8 text-center">
              <p className="text-lg font-semibold text-foreground">No hay ejercicios para mostrar</p>
              <p className="mt-2 text-sm text-muted">
                Esta carpeta esta vacia o la busqueda actual no encontro coincidencias.
              </p>
            </div>
          )
        ) : null}
      </div>

      <AppModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        title="Importar ejercicios por CSV"
        widthClass="max-w-5xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Descarga una plantilla por tipo, sube el CSV y se importaran solo las filas validas.
          </p>

          {!csvType ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {CSV_TEMPLATE_TYPES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => selectCsvType(entry.value)}
                  className="rounded-3xl border border-border bg-surface-2 p-5 text-left transition hover:border-primary/40 hover:bg-surface"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <FolderIcon />
                    </span>
                    <div>
                      <p className="text-base font-semibold text-foreground">{entry.label}</p>
                      <p className="text-xs text-muted">Plantilla e importacion CSV</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {CSV_TEMPLATE_TYPES.find((entry) => entry.value === csvType)?.label || "Tipo"}
                  </p>
                  <p className="text-xs text-muted">Usa el encabezado exacto de la plantilla descargable.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={goBackFromCsvType}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Subir carpeta
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadCsvTemplate(csvType)}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                  >
                    Descargar plantilla CSV
                  </button>
                  <label className="inline-flex cursor-pointer items-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2">
                    Subir CSV
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCsvFileChange}
                    />
                  </label>
                </div>
              </div>

              {csvSummary ? (
                <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
                  {csvSummary}
                </div>
              ) : null}

              {csvPreviewRows.length ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Vista previa de filas ({csvPreviewRows.length})
                    </p>
                    <button
                      type="button"
                      disabled={busyKey === "csv-import" || !csvPreviewRows.some((row) => row.valid)}
                      onClick={handleImportValidCsvRows}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyKey === "csv-import" ? "Importando..." : "Importar solo validas"}
                    </button>
                  </div>

                  <div className="grid gap-3">
                    {csvPreviewRows.map((row) => (
                      <div
                        key={`csv-row-${row.index}`}
                        className={`rounded-2xl border px-4 py-3 ${
                          row.valid
                            ? "border-success/30 bg-success/10"
                            : "border-danger/30 bg-danger/10"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            Fila {row.index}: {row.title || "Sin titulo"}
                          </p>
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              row.valid
                                ? "bg-success/15 text-success"
                                : "bg-danger/15 text-danger"
                            }`}
                          >
                            {row.valid ? "Valida" : "Con error"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {row.skill} / {row.cefrLevel} / {getExerciseCategoryLabel(row.categoryName)}
                        </p>
                        <p className={`mt-2 text-sm ${row.valid ? "text-foreground" : "text-danger"}`}>
                          {row.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-surface-2 p-6 text-center">
                  <p className="text-sm font-semibold text-foreground">Aun no cargaste un CSV</p>
                  <p className="mt-1 text-xs text-muted">
                    Primero descarga la plantilla de este tipo y luego sube el archivo completado.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </AppModal>

      <ExerciseLibraryEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        exercise={editingExercise}
        categories={categories}
        defaultSkill={activeSkill || "grammar"}
        defaultLevel={activeLevel || "A1"}
        onSaved={handleSaved}
      />
    </div>
  );
}
