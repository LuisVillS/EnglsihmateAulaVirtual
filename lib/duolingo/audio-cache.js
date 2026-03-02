import { createHash } from "node:crypto";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { assertR2Writable, getPublicAssetUrl, getSignedDownloadUrl, putObjectToR2 } from "@/lib/r2";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeSpeechText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function buildAudioCacheKey({ language, voiceId, text, modelId }) {
  const normalized = [
    cleanText(language).toLowerCase() || "en",
    cleanText(voiceId),
    cleanText(modelId),
    normalizeSpeechText(text),
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex");
}

async function getCachedAudio(client, audioKey) {
  const { data, error } = await client
    .from("audio_cache")
    .select("audio_key, audio_url, r2_key, provider, language, voice_id, model_id")
    .eq("audio_key", audioKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (data.audio_url) {
    return {
      cached: true,
      audioKey,
      audioUrl: data.audio_url,
      r2Key: data.r2_key || null,
      provider: data.provider,
    };
  }

  if (data.r2_key) {
    let signedUrl = null;
    try {
      signedUrl = await getSignedDownloadUrl(data.r2_key);
    } catch {
      signedUrl = null;
    }

    return {
      cached: true,
      audioKey,
      audioUrl: signedUrl,
      r2Key: data.r2_key,
      provider: data.provider,
    };
  }

  return null;
}

async function upsertCachedAudio(client, payload) {
  const { error } = await client
    .from("audio_cache")
    .upsert(payload, { onConflict: "audio_key" });

  if (error) {
    throw new Error(error.message || "No se pudo guardar caché de audio.");
  }
}

export async function ensureElevenLabsAudio({
  text,
  language = "en",
  voiceId,
  modelId,
  serviceClient,
}) {
  const normalizedText = normalizeSpeechText(text);
  if (!normalizedText) {
    return {
      cached: false,
      skipped: true,
      reason: "empty-text",
      audioUrl: null,
      r2Key: null,
    };
  }

  const resolvedVoiceId = cleanText(voiceId) || cleanText(process.env.ELEVENLABS_VOICE_ID);
  const resolvedModelId = cleanText(modelId) || cleanText(process.env.ELEVENLABS_MODEL_ID) || "eleven_multilingual_v2";

  if (!resolvedVoiceId) {
    throw new Error("Configura ELEVENLABS_VOICE_ID o envía voiceId al generar audio.");
  }

  if (!hasServiceRoleClient() && !serviceClient) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para usar caché de audio.");
  }

  const client = serviceClient || getServiceSupabaseClient();
  const audioKey = buildAudioCacheKey({
    language,
    voiceId: resolvedVoiceId,
    text: normalizedText,
    modelId: resolvedModelId,
  });

  const cached = await getCachedAudio(client, audioKey);
  if (cached) {
    return cached;
  }

  await assertR2Writable();

  const apiKey = cleanText(process.env.ELEVENLABS_API_KEY);
  if (!apiKey) {
    throw new Error("Configura ELEVENLABS_API_KEY para generar audio.");
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: normalizedText,
      model_id: resolvedModelId,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`ElevenLabs error (${response.status}): ${message || "TTS failed"}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const r2Key = `tts/elevenlabs/${audioKey}.mp3`;
  await putObjectToR2(r2Key, audioBuffer, "audio/mpeg");

  const publicUrl = getPublicAssetUrl(r2Key);
  const audioUrl = publicUrl || null;

  await upsertCachedAudio(client, {
    audio_key: audioKey,
    provider: "elevenlabs",
    language: cleanText(language).toLowerCase() || "en",
    voice_id: resolvedVoiceId,
    model_id: resolvedModelId,
    normalized_text: normalizedText,
    r2_key: r2Key,
    audio_url: audioUrl,
    updated_at: new Date().toISOString(),
  });

  return {
    cached: false,
    audioKey,
    audioUrl,
    r2Key,
    provider: "elevenlabs",
    voiceId: resolvedVoiceId,
    modelId: resolvedModelId,
  };
}

export async function resolveAudioUrlFromContent(content = {}) {
  const audioUrl = cleanText(content.audio_url || content.audioUrl);
  if (audioUrl) return audioUrl;

  const r2Key = cleanText(content.r2_key || content.r2Key);
  if (!r2Key) return null;

  try {
    return await getSignedDownloadUrl(r2Key);
  } catch {
    return null;
  }
}
