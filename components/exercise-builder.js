"use client";

import { useState } from "react";
import AudioUploader from "./audio-uploader";

const exerciseKinds = [
  { value: "listening", label: "Listening" },
  { value: "speaking", label: "Speaking" },
  { value: "multiple_choice", label: "Multiple Choice" },
];

export default function ExerciseBuilder({ action, lessons = [] }) {
  const [audioUrl, setAudioUrl] = useState("");
  const [r2Key, setR2Key] = useState("");

  const handleUploadCompleted = ({ visibility, key, publicUrl }) => {
    if (visibility === "public" && publicUrl) {
      setAudioUrl(publicUrl);
      setR2Key("");
    } else {
      setR2Key(key);
      setAudioUrl("");
    }
  };

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-lg font-semibold text-foreground">Nuevo ejercicio</h3>
      <input type="hidden" name="exerciseId" value="" />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Leccion destino</label>
          <select
            name="lessonId"
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          >
            <option value="">Selecciona una leccion</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Tipo</label>
          <select
            name="kind"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            defaultValue="listening"
          >
            {exerciseKinds.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-muted">Prompt</label>
        <textarea
          name="prompt"
          required
          rows={3}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Describe la consigna del ejercicio"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Respuesta correcta</label>
          <input
            name="answer"
            required
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            placeholder="Ej: Buenos días"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Opciones (una por linea)</label>
          <textarea
            name="choices"
            rows={3}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            placeholder={"Opción A\nOpción B"}
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">audio_url</label>
          <input
            name="audioUrl"
            value={audioUrl}
            onChange={(event) => setAudioUrl(event.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            placeholder="Pega una URL pública"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">r2_key (privado)</label>
          <input
            name="r2Key"
            value={r2Key}
            onChange={(event) => setR2Key(event.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            placeholder="audios/demo.wav"
          />
        </div>
      </div>
      <AudioUploader onUploadCompleted={handleUploadCompleted} />
      <button
        type="submit"
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition hover:bg-primary-2"
      >
        Guardar ejercicio
      </button>
    </form>
  );
}

