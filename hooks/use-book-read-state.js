"use client";

import { useEffect, useState } from "react";
import { clearBookPlace, fetchBookReadState, saveBookPlace } from "@/lib/library/client-read-state";

export function useBookReadState(slug, initialReadState = null) {
  const [readState, setReadState] = useState(initialReadState || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReadState(initialReadState || null);
  }, [initialReadState]);

  async function refreshReadState() {
    if (!slug) return null;
    setLoading(true);
    setError("");

    try {
      const nextState = await fetchBookReadState(slug);
      setReadState(nextState || null);
      return nextState || null;
    } catch (requestError) {
      setError(requestError?.message || "No se pudo cargar el estado de lectura.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function savePlace(pageNumber, options = {}) {
    if (!slug) return null;
    setSaving(true);
    setError("");

    try {
      const nextState = await saveBookPlace(slug, pageNumber, options);
      setReadState(nextState || null);
      return nextState || null;
    } catch (requestError) {
      setError(requestError?.message || "No se pudo guardar la pagina.");
      throw requestError;
    } finally {
      setSaving(false);
    }
  }

  async function clearPlace() {
    if (!slug) return null;
    setSaving(true);
    setError("");

    try {
      const nextState = await clearBookPlace(slug);
      setReadState(nextState || null);
      return nextState || null;
    } catch (requestError) {
      setError(requestError?.message || "No se pudo borrar la pagina guardada.");
      throw requestError;
    } finally {
      setSaving(false);
    }
  }

  return {
    readState,
    setReadState,
    loading,
    saving,
    error,
    refreshReadState,
    savePlace,
    clearPlace,
  };
}
