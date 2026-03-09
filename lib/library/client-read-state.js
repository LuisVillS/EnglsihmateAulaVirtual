"use client";

async function parseJsonResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || fallbackMessage);
  }
  return payload;
}

export async function fetchBookReadState(slug) {
  const response = await fetch(`/api/library/books/${slug}/read-state`, {
    cache: "no-store",
  });
  const payload = await parseJsonResponse(response, "No se pudo cargar el estado de lectura.");
  return payload?.readState || payload || null;
}

export async function saveBookPlace(slug, pageNumber, options = {}) {
  const response = await fetch(`/api/library/books/${slug}/save-place`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pageNumber,
      pageCode: options?.pageCode || undefined,
    }),
  });
  const payload = await parseJsonResponse(response, "No se pudo guardar la pagina.");
  return payload?.readState || payload || null;
}

export async function clearBookPlace(slug) {
  const response = await fetch(`/api/library/books/${slug}/clear-place`, {
    method: "POST",
  });
  const payload = await parseJsonResponse(response, "No se pudo borrar la pagina guardada.");
  return payload?.readState || payload || null;
}

export async function updateBookProgress(slug, progress = {}, options = {}) {
  const response = await fetch(`/api/library/books/${slug}/progress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(progress || {}),
    keepalive: Boolean(options.keepalive),
  });
  const payload = await parseJsonResponse(response, "No se pudo guardar el progreso de lectura.");
  return payload?.readState || payload || null;
}
