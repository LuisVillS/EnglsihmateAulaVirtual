"use client";

import { useState } from "react";

export default function AudioUploader({ onUploadCompleted }) {
  const [visibility, setVisibility] = useState("public");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setStatus("signing");

    try {
      const response = await fetch("/api/r2/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "audio/mpeg",
          visibility,
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo obtener la URL firmada");
      }

      const data = await response.json();
      setStatus("uploading");

      const uploadResponse = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "audio/mpeg",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("El upload a R2 falló");
      }

      setStatus("done");
      if (onUploadCompleted) {
        onUploadCompleted({
          key: data.key,
          visibility,
          publicUrl: data.publicUrl || null,
        });
      }
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="font-medium text-muted">Visibilidad:</label>
        <select
          value={visibility}
          onChange={(event) => setVisibility(event.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm text-foreground"
        >
          <option value="public">Pública (usa CDN)</option>
          <option value="private">Privada (requiere URL firmada)</option>
        </select>
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-4 py-6 text-center text-muted">
        <span className="text-sm font-medium">Selecciona un archivo de audio</span>
        <input type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
      </label>
      <div className="mt-3 text-xs text-muted">
        Estado: {status === "idle" && "Listo"}
        {status === "signing" && "Generando URL firmada"}
        {status === "uploading" && "Subiendo a R2"}
        {status === "done" && "¡Audio cargado!"}
        {status === "error" && <span className="text-danger"> {error}</span>}
      </div>
      {status === "done" && visibility === "public" ? (
        <p className="mt-2 text-xs text-muted">
          Copia el campo <code>audio_url</code> generado en el formulario.
        </p>
      ) : null}
      {status === "done" && visibility === "private" ? (
        <p className="mt-2 text-xs text-muted">
          Guarda el <code>r2_key</code> generado para reproducir con URL firmada.
        </p>
      ) : null}
    </div>
  );
}

