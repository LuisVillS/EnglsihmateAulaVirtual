"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertCommission } from "@/app/admin/actions";
import { buildFrequencySessionDrafts, formatSessionDateLabel, getFrequencyReference } from "@/lib/course-sessions";

const INITIAL_STATE = { success: false, error: null, message: null };

const LEVEL_ORDER = [
  "BASICO A1",
  "BASICO A2",
  "INTERMEDIO B1",
  "INTERMEDIO B2",
  "AVANZADO C1",
];

const LEVEL_LABELS = {
  "BASICO A1": "Basico A1",
  "BASICO A2": "Basico A2",
  "INTERMEDIO B1": "Intermedio B1",
  "INTERMEDIO B2": "Intermedio B2",
  "AVANZADO C1": "Avanzado C1",
};

const FREQUENCY_ORDER = ["DAILY", "MWF", "TT", "SAT"];
const FREQUENCY_LABELS = {
  DAILY: "Diario",
  MWF: "Interdiario 1 (LMV)",
  TT: "Interdiario 2 (MJ)",
  SAT: "Sabatinos",
};

function normalizeFrequency(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "LMV") return "MWF";
  if (FREQUENCY_ORDER.includes(raw)) return raw;
  return "";
}

function parseTimeToMinutes(value) {
  const [hoursRaw, minsRaw] = String(value || "").split(":");
  const hours = Number(hoursRaw);
  const mins = Number(minsRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return (hours * 60) + mins;
}

function formatMinutesToTime(value) {
  const totalMinutes = Number(value);
  if (!Number.isFinite(totalMinutes)) return "";
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60).toString().padStart(2, "0");
  const minutes = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function normalizeMonthInput(value) {
  if (!value) return "";
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 7);
  return "";
}

export default function CommissionCreateForm({ templates = [] }) {
  const [state, formAction] = useActionState(upsertCommission, INITIAL_STATE);
  const router = useRouter();
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedFrequency, setSelectedFrequency] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [startMonth, setStartMonth] = useState(() => normalizeMonthInput(new Date().toISOString().slice(0, 7)));
  const [startTime, setStartTime] = useState("19:00");

  useEffect(() => {
    if (!state?.success) return;
    router.refresh();
  }, [state, router]);

  const normalizedTemplates = useMemo(() => {
    return (Array.isArray(templates) ? templates : [])
      .map((template) => {
        const frequency = normalizeFrequency(template?.frequency);
        const reference = getFrequencyReference(frequency);
        const classDurationMinutes =
          Number(template?.class_duration_minutes) > 0
            ? Number(template.class_duration_minutes)
            : Math.max(1, Math.round(Number(reference?.hoursPerClass || 1) * 60));
        const courseDurationMonths =
          Number(template?.course_duration_months) > 0
            ? Number(template.course_duration_months)
            : Number(reference?.months || 1);
        return {
          id: String(template?.id || "").trim(),
          level: String(template?.course_level || "").trim(),
          frequency,
          name: String(template?.template_name || "").trim() || "Plantilla",
          classDurationMinutes,
          courseDurationMonths,
          sessionsPerMonth: Number(reference?.sessionsPerMonth || 0),
        };
      })
      .filter((template) => template.id && template.level && template.frequency)
      .sort((left, right) => {
        const leftLevelIdx = LEVEL_ORDER.indexOf(left.level);
        const rightLevelIdx = LEVEL_ORDER.indexOf(right.level);
        const levelDiff = (leftLevelIdx >= 0 ? leftLevelIdx : LEVEL_ORDER.length) - (rightLevelIdx >= 0 ? rightLevelIdx : LEVEL_ORDER.length);
        if (levelDiff !== 0) return levelDiff;
        const leftFreqIdx = FREQUENCY_ORDER.indexOf(left.frequency);
        const rightFreqIdx = FREQUENCY_ORDER.indexOf(right.frequency);
        const freqDiff = (leftFreqIdx >= 0 ? leftFreqIdx : FREQUENCY_ORDER.length) - (rightFreqIdx >= 0 ? rightFreqIdx : FREQUENCY_ORDER.length);
        if (freqDiff !== 0) return freqDiff;
        return left.name.localeCompare(right.name);
      });
  }, [templates]);

  const templateById = useMemo(
    () => new Map(normalizedTemplates.map((template) => [template.id, template])),
    [normalizedTemplates]
  );
  const selectedTemplate = templateById.get(templateId) || null;

  const computedEndTime = useMemo(() => {
    if (!selectedTemplate) return "";
    const startMinutes = parseTimeToMinutes(startTime);
    if (startMinutes == null) return "";
    return formatMinutesToTime(startMinutes + selectedTemplate.classDurationMinutes);
  }, [selectedTemplate, startTime]);

  const computedRange = useMemo(() => {
    if (!selectedTemplate || !startMonth || !startTime || !computedEndTime) return null;
    const rows = buildFrequencySessionDrafts({
      commissionId: null,
      frequency: selectedTemplate.frequency,
      startMonth: `${startMonth}-01`,
      durationMonths: selectedTemplate.courseDurationMonths,
      startTime,
      endTime: computedEndTime,
      status: "scheduled",
    });
    if (!rows.length) return null;
    return {
      totalSessions: rows.length,
      firstDate: rows[0]?.session_date || null,
      lastDate: rows[rows.length - 1]?.session_date || null,
    };
  }, [selectedTemplate, startMonth, startTime, computedEndTime]);

  const templatesByLevel = useMemo(() => {
    const map = new Map();
    normalizedTemplates.forEach((template) => {
      const current = map.get(template.level) || [];
      current.push(template);
      map.set(template.level, current);
    });
    return map;
  }, [normalizedTemplates]);

  const availableLevels = useMemo(
    () => LEVEL_ORDER.filter((level) => (templatesByLevel.get(level) || []).length > 0),
    [templatesByLevel]
  );

  const availableFrequencies = useMemo(() => {
    if (!selectedLevel) return [];
    const rows = templatesByLevel.get(selectedLevel) || [];
    return FREQUENCY_ORDER.filter((frequency) =>
      rows.some((template) => template.frequency === frequency)
    );
  }, [selectedLevel, templatesByLevel]);

  const availableTemplates = useMemo(() => {
    if (!selectedLevel || !selectedFrequency) return [];
    return (templatesByLevel.get(selectedLevel) || []).filter(
      (template) => template.frequency === selectedFrequency
    );
  }, [selectedFrequency, selectedLevel, templatesByLevel]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nivel</label>
          <select
            value={selectedLevel}
            onChange={(event) => {
              const nextLevel = event.target.value;
              setSelectedLevel(nextLevel);
              setSelectedFrequency("");
              setTemplateId("");
            }}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Selecciona nivel</option>
            {availableLevels.map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABELS[level] || level}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Frecuencia</label>
          <select
            value={selectedFrequency}
            onChange={(event) => {
              setSelectedFrequency(event.target.value);
              setTemplateId("");
            }}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedLevel}
          >
            <option value="">Selecciona frecuencia</option>
            {availableFrequencies.map((frequency) => (
              <option key={frequency} value={frequency}>
                {FREQUENCY_LABELS[frequency] || frequency}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Plantilla</label>
          <select
            name="template_id"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedFrequency}
            required
          >
            <option value="" disabled>
              Selecciona plantilla
            </option>
            {availableTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Mes de inicio</label>
          <input
            type="month"
            name="start_month"
            value={startMonth}
            onChange={(event) => setStartMonth(event.target.value)}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Horario de inicio</label>
          <input
            type="time"
            step={1800}
            name="start_time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
        {selectedTemplate ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              Nivel: <span className="font-semibold text-foreground">{LEVEL_LABELS[selectedTemplate.level] || selectedTemplate.level}</span>
            </p>
            <p>
              Frecuencia: <span className="font-semibold text-foreground">{FREQUENCY_LABELS[selectedTemplate.frequency] || selectedTemplate.frequency}</span>
            </p>
            <p>
              Duracion por clase: <span className="font-semibold text-foreground">{selectedTemplate.classDurationMinutes} min</span>
            </p>
            <p>
              Hora fin (auto): <span className="font-semibold text-foreground">{computedEndTime || "-"}</span>
            </p>
            <p>
              Duracion del curso: <span className="font-semibold text-foreground">{selectedTemplate.courseDurationMonths} meses</span>
            </p>
            <p>
              Sesiones por mes: <span className="font-semibold text-foreground">{selectedTemplate.sessionsPerMonth || "-"}</span>
            </p>
            <p className="sm:col-span-2">
              Fecha estimada fin:{" "}
              <span className="font-semibold text-foreground">
                {computedRange?.lastDate ? formatSessionDateLabel(computedRange.lastDate) : "-"}
              </span>
              {computedRange?.totalSessions ? ` (${computedRange.totalSessions} clases)` : ""}
            </p>
          </div>
        ) : (
          "Selecciona plantilla para calcular frecuencia, duracion y fecha estimada de fin."
        )}
      </div>

      {state?.error ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-2 text-xs text-success">
          {state.message || "Comision guardada."}
        </p>
      ) : null}

      <button
        type="submit"
        className="w-full rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
      >
        Crear comision
      </button>
    </form>
  );
}
