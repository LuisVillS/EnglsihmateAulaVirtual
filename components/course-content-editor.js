"use client";

import { useMemo, useState } from "react";

const STATUS_OPTIONS = ["draft", "published", "archived"];
const EXERCISE_TYPES = ["scramble", "audio_match", "image_match", "pairs", "cloze"];

function toJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function pretty(value) {
  return JSON.stringify(value || {}, null, 2);
}

function defaultContent(type) {
  if (type === "audio_match") {
    return { text_target: "How are you?", mode: "dictation", provider: "elevenlabs" };
  }
  if (type === "image_match") {
    return {
      question_native: "¿Cuál es 'El Pan'?",
      options: [
        { vocab_id: "", image_url: "" },
        { vocab_id: "", image_url: "" },
        { vocab_id: "", image_url: "" },
        { vocab_id: "", image_url: "" },
      ],
      correct_index: 0,
    };
  }
  if (type === "pairs") {
    return { pairs: [{ native: "Pan", target: "Bread" }, { native: "Manzana", target: "Apple" }] };
  }
  if (type === "cloze") {
    return { sentence: "I ____ a student.", options: ["am", "are", "is", "be"], correct_index: 0 };
  }
  return { prompt_native: "Yo soy estudiante", target_words: ["I", "am", "a", "student"], answer_order: [0, 1, 2, 3] };
}

function upsert(list, item) {
  const idx = list.findIndex((row) => row.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = { ...next[idx], ...item };
  return next;
}

function remove(list, id) {
  return list.filter((row) => row.id !== id);
}

function csvFromVocabulary(rows) {
  const header = "word_target,word_native,category,level,status,image_url,audio_url,tags";
  const lines = rows.map((row) => {
    const tags = Array.isArray(row.tags) ? row.tags.join("|") : "";
    const values = [
      row.word_target || "",
      row.word_native || "",
      row.category || "",
      row.level || "",
      row.status || "draft",
      row.image_url || "",
      row.audio_url || "",
      tags,
    ];
    return values.map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(",");
  });
  return [header, ...lines].join("\n");
}

function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((header) => header.replace(/^"|"$/g, "").toLowerCase().trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.replace(/^"|"$/g, "").replace(/""/g, "\"").trim());
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx] || "";
    });
    return row;
  });
}

function ExercisePreview({ preview }) {
  const exercise = preview?.exercise;
  if (!exercise) {
    return <p className="text-sm text-muted">Sin preview todavía.</p>;
  }
  const content = exercise.content || {};
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{exercise.type}</p>
      {exercise.type === "audio_match" && content.audio_url ? (
        <audio controls src={content.audio_url} className="w-full" />
      ) : null}
      <pre className="overflow-x-auto rounded-xl border border-border bg-background p-3 text-xs text-foreground">
        {pretty(content)}
      </pre>
    </div>
  );
}

export default function CourseContentEditor({ initialData }) {
  const [vocabulary, setVocabulary] = useState(initialData.vocabulary || []);
  const [lessons, setLessons] = useState(initialData.lessons || []);
  const [exercises, setExercises] = useState(initialData.exercises || []);
  const [notice, setNotice] = useState(initialData.errors?.join(" | ") || "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [preview, setPreview] = useState(null);
  const [validation, setValidation] = useState(null);

  const [vocabForm, setVocabForm] = useState({
    id: "",
    word_target: "",
    word_native: "",
    category: "",
    level: "",
    tags: "",
    image_url: "",
    audio_url: "",
    status: "draft",
    generate_audio: false,
  });
  const [lessonForm, setLessonForm] = useState({
    id: "",
    title: "",
    description: "",
    level: "A1",
    ordering: "1",
    status: "draft",
    unit_id: initialData.units?.[0]?.id || "",
    subject_id: initialData.subjects?.[0]?.id || "",
  });
  const [exerciseForm, setExerciseForm] = useState({
    id: "",
    lesson_id: initialData.lessons?.[0]?.id || "",
    type: "scramble",
    status: "draft",
    ordering: "1",
    content_json: pretty(defaultContent("scramble")),
    vocabulary_ids: [],
    generate_audio: false,
  });

  const lessonById = useMemo(() => {
    const map = new Map();
    lessons.forEach((lesson) => map.set(lesson.id, lesson.title));
    return map;
  }, [lessons]);

  async function requestJson(url, method, body) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Error ${response.status}`);
    }
    return data;
  }

  function resetAlerts() {
    setError("");
    setNotice("");
  }

  function onSelectVocabulary(id) {
    const selected = vocabulary.find((row) => row.id === id);
    if (!selected) {
      setVocabForm((prev) => ({ ...prev, id: "" }));
      return;
    }
    setVocabForm({
      id: selected.id,
      word_target: selected.word_target || "",
      word_native: selected.word_native || "",
      category: selected.category || "",
      level: selected.level || "",
      tags: Array.isArray(selected.tags) ? selected.tags.join(",") : "",
      image_url: selected.image_url || "",
      audio_url: selected.audio_url || "",
      status: selected.status || "draft",
      generate_audio: false,
    });
  }

  async function saveVocabulary() {
    resetAlerts();
    setPending("vocab-save");
    try {
      const data = await requestJson("/api/admin/vocabulary", vocabForm.id ? "PUT" : "POST", vocabForm);
      if (data?.vocabulary?.id) {
        setVocabulary((prev) => upsert(prev, data.vocabulary));
        setVocabForm((prev) => ({ ...prev, id: data.vocabulary.id }));
      }
      setNotice("Vocabulario guardado.");
    } catch (err) {
      setError(err.message || "No se pudo guardar vocabulario.");
    } finally {
      setPending("");
    }
  }

  async function deleteVocabulary() {
    if (!vocabForm.id) return;
    resetAlerts();
    setPending("vocab-delete");
    try {
      await requestJson("/api/admin/vocabulary", "DELETE", { id: vocabForm.id });
      setVocabulary((prev) => remove(prev, vocabForm.id));
      setVocabForm({
        id: "",
        word_target: "",
        word_native: "",
        category: "",
        level: "",
        tags: "",
        image_url: "",
        audio_url: "",
        status: "draft",
        generate_audio: false,
      });
      setNotice("Vocabulario eliminado.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar vocabulario.");
    } finally {
      setPending("");
    }
  }

  function onSelectLesson(id) {
    const selected = lessons.find((row) => row.id === id);
    if (!selected) {
      setLessonForm((prev) => ({ ...prev, id: "" }));
      return;
    }
    setLessonForm({
      id: selected.id,
      title: selected.title || "",
      description: selected.description || "",
      level: selected.level || "A1",
      ordering: String(selected.ordering || 1),
      status: selected.status || "draft",
      unit_id: selected.unit_id || initialData.units?.[0]?.id || "",
      subject_id: selected.subject_id || initialData.subjects?.[0]?.id || "",
    });
  }

  async function saveLesson() {
    resetAlerts();
    setPending("lesson-save");
    try {
      const payload = { ...lessonForm, ordering: Number(lessonForm.ordering || 1) };
      const data = await requestJson("/api/admin/lessons", lessonForm.id ? "PUT" : "POST", payload);
      if (data?.lesson?.id) {
        setLessons((prev) => upsert(prev, data.lesson));
        setLessonForm((prev) => ({ ...prev, id: data.lesson.id }));
      }
      setNotice("Lección guardada.");
    } catch (err) {
      setError(err.message || "No se pudo guardar lección.");
    } finally {
      setPending("");
    }
  }

  async function deleteLesson() {
    if (!lessonForm.id) return;
    resetAlerts();
    setPending("lesson-delete");
    try {
      await requestJson("/api/admin/lessons", "DELETE", { id: lessonForm.id });
      setLessons((prev) => remove(prev, lessonForm.id));
      setLessonForm({
        id: "",
        title: "",
        description: "",
        level: "A1",
        ordering: "1",
        status: "draft",
        unit_id: initialData.units?.[0]?.id || "",
        subject_id: initialData.subjects?.[0]?.id || "",
      });
      setNotice("Lección eliminada.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar lección.");
    } finally {
      setPending("");
    }
  }

  function onSelectExercise(id) {
    const selected = exercises.find((row) => row.id === id);
    if (!selected) {
      setExerciseForm((prev) => ({ ...prev, id: "" }));
      return;
    }
    setExerciseForm({
      id: selected.id,
      lesson_id: selected.lesson_id || initialData.lessons?.[0]?.id || "",
      type: selected.type || "scramble",
      status: selected.status || "draft",
      ordering: String(selected.ordering || 1),
      content_json: pretty(selected.content_json || {}),
      vocabulary_ids: (selected.exercise_vocabulary || []).map((row) => row.vocab_id),
      generate_audio: false,
    });
  }

  async function validateExercise() {
    resetAlerts();
    setPending("exercise-validate");
    try {
      const parsed = toJson(exerciseForm.content_json, null);
      if (!parsed) throw new Error("content_json inválido");
      const data = await requestJson("/api/admin/exercises/validate", "POST", {
        type: exerciseForm.type,
        content_json: parsed,
      });
      setValidation(data);
      if (!data.valid) {
        setError((data.errors || ["Ejercicio inválido"]).join(" "));
      } else {
        setNotice("Validación correcta.");
      }
    } catch (err) {
      setValidation(null);
      setError(err.message || "No se pudo validar.");
    } finally {
      setPending("");
    }
  }

  async function saveExercise() {
    resetAlerts();
    setPending("exercise-save");
    try {
      const parsed = toJson(exerciseForm.content_json, null);
      if (!parsed) throw new Error("content_json inválido");
      const payload = {
        ...exerciseForm,
        ordering: Number(exerciseForm.ordering || 1),
        content_json: parsed,
      };
      const data = await requestJson("/api/admin/exercises", exerciseForm.id ? "PUT" : "POST", payload);
      if (data?.exercise?.id) {
        const record = {
          ...data.exercise,
          content_json: parsed,
          exercise_vocabulary: exerciseForm.vocabulary_ids.map((id) => ({ vocab_id: id })),
        };
        setExercises((prev) => upsert(prev, record));
        setExerciseForm((prev) => ({ ...prev, id: data.exercise.id }));
      }
      setNotice("Ejercicio guardado.");
    } catch (err) {
      setError(err.message || "No se pudo guardar ejercicio.");
    } finally {
      setPending("");
    }
  }

  async function deleteExercise() {
    if (!exerciseForm.id) return;
    resetAlerts();
    setPending("exercise-delete");
    try {
      await requestJson("/api/admin/exercises", "DELETE", { id: exerciseForm.id });
      setExercises((prev) => remove(prev, exerciseForm.id));
      setExerciseForm({
        id: "",
        lesson_id: initialData.lessons?.[0]?.id || "",
        type: "scramble",
        status: "draft",
        ordering: "1",
        content_json: pretty(defaultContent("scramble")),
        vocabulary_ids: [],
        generate_audio: false,
      });
      setPreview(null);
      setNotice("Ejercicio eliminado.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar ejercicio.");
    } finally {
      setPending("");
    }
  }

  async function loadPreview() {
    if (!exerciseForm.id) {
      setError("Guarda o selecciona un ejercicio para preview.");
      return;
    }
    resetAlerts();
    setPending("exercise-preview");
    try {
      const data = await requestJson(`/api/admin/exercises/${exerciseForm.id}/preview`, "GET");
      setPreview(data);
      setNotice("Preview cargado.");
    } catch (err) {
      setError(err.message || "No se pudo cargar preview.");
    } finally {
      setPending("");
    }
  }

  function exportVocabulary() {
    const csv = csvFromVocabulary(vocabulary);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "vocabulary.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function importVocabulary(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    resetAlerts();
    setPending("vocab-import");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      let count = 0;
      for (const row of rows) {
        const data = await requestJson("/api/admin/vocabulary", "POST", {
          word_target: row.word_target,
          word_native: row.word_native,
          category: row.category,
          level: row.level,
          status: row.status || "draft",
          image_url: row.image_url,
          audio_url: row.audio_url,
          tags: row.tags ? row.tags.split("|") : [],
        });
        if (data?.vocabulary?.id) {
          setVocabulary((prev) => upsert(prev, data.vocabulary));
          count += 1;
        }
      }
      setNotice(`Importación CSV completada: ${count} registros.`);
    } catch (err) {
      setError(err.message || "No se pudo importar CSV.");
    } finally {
      setPending("");
      event.target.value = "";
    }
  }

  function exportExercises() {
    const payload = exercises.map((exercise) => ({
      lesson_id: exercise.lesson_id,
      type: exercise.type,
      status: exercise.status,
      ordering: exercise.ordering,
      content_json: exercise.content_json,
      vocabulary_ids: (exercise.exercise_vocabulary || []).map((row) => row.vocab_id),
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "exercises.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function importExercises(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    resetAlerts();
    setPending("exercise-import");
    try {
      const text = await file.text();
      const rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error("El JSON debe ser una lista.");
      let count = 0;
      for (const row of rows) {
        const data = await requestJson("/api/admin/exercises", "POST", row);
        if (data?.exercise?.id) {
          setExercises((prev) => upsert(prev, data.exercise));
          count += 1;
        }
      }
      setNotice(`Importación JSON completada: ${count} ejercicios.`);
    } catch (err) {
      setError(err.message || "No se pudo importar JSON.");
    } finally {
      setPending("");
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p> : null}
      {notice ? <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-2 text-sm text-success">{notice}</p> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Vocabulary</h2>
          <p className="text-sm text-muted">CRUD + import/export CSV.</p>
          <div className="mt-4 space-y-2">
            <select value={vocabForm.id} onChange={(e) => onSelectVocabulary(e.target.value)} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              <option value="">Nuevo vocabulario</option>
              {vocabulary.map((row) => (
                <option key={row.id} value={row.id}>{row.word_native} - {row.word_target}</option>
              ))}
            </select>
            <input value={vocabForm.word_native} onChange={(e) => setVocabForm((prev) => ({ ...prev, word_native: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="word_native" />
            <input value={vocabForm.word_target} onChange={(e) => setVocabForm((prev) => ({ ...prev, word_target: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="word_target" />
            <input value={vocabForm.category} onChange={(e) => setVocabForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="category" />
            <input value={vocabForm.level} onChange={(e) => setVocabForm((prev) => ({ ...prev, level: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="level" />
            <input value={vocabForm.tags} onChange={(e) => setVocabForm((prev) => ({ ...prev, tags: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="tags (a,b,c)" />
            <input value={vocabForm.image_url} onChange={(e) => setVocabForm((prev) => ({ ...prev, image_url: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="image_url" />
            <input value={vocabForm.audio_url} onChange={(e) => setVocabForm((prev) => ({ ...prev, audio_url: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="audio_url" />
            <select value={vocabForm.status} onChange={(e) => setVocabForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={vocabForm.generate_audio} onChange={(e) => setVocabForm((prev) => ({ ...prev, generate_audio: e.target.checked }))} />
              Generar audio ElevenLabs
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={saveVocabulary} disabled={Boolean(pending)} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                {pending === "vocab-save" ? "Guardando..." : "Guardar"}
              </button>
              <button type="button" onClick={deleteVocabulary} disabled={!vocabForm.id || Boolean(pending)} className="rounded-xl border border-danger/50 px-3 py-2 text-sm text-danger">Eliminar</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={exportVocabulary} className="rounded-xl border border-border px-3 py-2 text-sm">Exportar CSV</button>
              <label className="cursor-pointer rounded-xl border border-border px-3 py-2 text-center text-sm">
                Importar CSV
                <input type="file" accept=".csv" className="hidden" onChange={importVocabulary} />
              </label>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Lessons</h2>
          <p className="text-sm text-muted">CRUD + publish con validación de ejercicios.</p>
          <div className="mt-4 space-y-2">
            <select value={lessonForm.id} onChange={(e) => onSelectLesson(e.target.value)} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              <option value="">Nueva lección</option>
              {lessons.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </select>
            <input value={lessonForm.title} onChange={(e) => setLessonForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="title" />
            <textarea rows={3} value={lessonForm.description} onChange={(e) => setLessonForm((prev) => ({ ...prev, description: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="description" />
            <input value={lessonForm.level} onChange={(e) => setLessonForm((prev) => ({ ...prev, level: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" placeholder="level" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="number" min="1" value={lessonForm.ordering} onChange={(e) => setLessonForm((prev) => ({ ...prev, ordering: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" />
              <select value={lessonForm.status} onChange={(e) => setLessonForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={lessonForm.unit_id} onChange={(e) => setLessonForm((prev) => ({ ...prev, unit_id: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
                <option value="">unit_id</option>
                {(initialData.units || []).map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}
              </select>
              <select value={lessonForm.subject_id} onChange={(e) => setLessonForm((prev) => ({ ...prev, subject_id: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
                <option value="">subject_id</option>
                {(initialData.subjects || []).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={saveLesson} disabled={Boolean(pending)} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                {pending === "lesson-save" ? "Guardando..." : "Guardar"}
              </button>
              <button type="button" onClick={deleteLesson} disabled={!lessonForm.id || Boolean(pending)} className="rounded-xl border border-danger/50 px-3 py-2 text-sm text-danger">Eliminar</button>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Exercises</h2>
          <p className="text-sm text-muted">5 tipos atómicos + validate + preview + JSON import/export.</p>
          <div className="mt-4 space-y-2">
            <select value={exerciseForm.id} onChange={(e) => onSelectExercise(e.target.value)} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              <option value="">Nuevo ejercicio</option>
              {exercises.map((row) => (
                <option key={row.id} value={row.id}>
                  {lessonById.get(row.lesson_id) || "Lección"} - {row.type} - {row.status}
                </option>
              ))}
            </select>
            <select value={exerciseForm.lesson_id} onChange={(e) => setExerciseForm((prev) => ({ ...prev, lesson_id: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              <option value="">Selecciona lección</option>
              {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
            </select>
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={exerciseForm.type} onChange={(e) => setExerciseForm((prev) => ({ ...prev, type: e.target.value, content_json: pretty(defaultContent(e.target.value)) }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
                {EXERCISE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select value={exerciseForm.status} onChange={(e) => setExerciseForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <input type="number" min="1" value={exerciseForm.ordering} onChange={(e) => setExerciseForm((prev) => ({ ...prev, ordering: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm" />
            <textarea rows={10} value={exerciseForm.content_json} onChange={(e) => setExerciseForm((prev) => ({ ...prev, content_json: e.target.value }))} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-xs" />
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">Vocabulario asociado</p>
              <div className="grid max-h-28 gap-1 overflow-y-auto text-xs">
                {vocabulary.map((row) => {
                  const checked = exerciseForm.vocabulary_ids.includes(row.id);
                  return (
                    <label key={row.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setExerciseForm((prev) => ({
                            ...prev,
                            vocabulary_ids: e.target.checked
                              ? [...prev.vocabulary_ids, row.id]
                              : prev.vocabulary_ids.filter((id) => id !== row.id),
                          }))
                        }
                      />
                      {row.word_native} - {row.word_target}
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={exerciseForm.generate_audio} onChange={(e) => setExerciseForm((prev) => ({ ...prev, generate_audio: e.target.checked }))} />
              Generar audio en publish (audio_match)
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={validateExercise} disabled={Boolean(pending)} className="rounded-xl border border-border px-3 py-2 text-sm">
                {pending === "exercise-validate" ? "Validando..." : "Validar"}
              </button>
              <button type="button" onClick={loadPreview} disabled={Boolean(pending) || !exerciseForm.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                {pending === "exercise-preview" ? "Cargando..." : "Preview"}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={saveExercise} disabled={Boolean(pending)} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                {pending === "exercise-save" ? "Guardando..." : "Guardar"}
              </button>
              <button type="button" onClick={deleteExercise} disabled={!exerciseForm.id || Boolean(pending)} className="rounded-xl border border-danger/50 px-3 py-2 text-sm text-danger">
                Eliminar
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={exportExercises} className="rounded-xl border border-border px-3 py-2 text-sm">Exportar JSON</button>
              <label className="cursor-pointer rounded-xl border border-border px-3 py-2 text-center text-sm">
                Importar JSON
                <input type="file" accept="application/json" className="hidden" onChange={importExercises} />
              </label>
            </div>
            {validation ? (
              <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs">
                <p className="font-semibold">Validación: {validation.valid ? "OK" : "Errores"}</p>
                {!validation.valid ? (
                  <ul className="mt-1 space-y-1 text-danger">
                    {(validation.errors || []).map((item, idx) => <li key={idx}>- {item}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </article>
      </div>

      <article className="rounded-3xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Preview Mode</h2>
        <p className="mb-3 text-sm text-muted">Vista del ejercicio (GET `/api/admin/exercises/:id/preview`).</p>
        <ExercisePreview preview={preview} />
      </article>
    </div>
  );
}
