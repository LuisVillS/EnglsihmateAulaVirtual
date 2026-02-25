import {
  EXERCISE_SKILL_TAG_VALUES,
  LEGACY_KIND_BY_TYPE,
} from "@/lib/duolingo/constants";
import { ensureElevenLabsAudio } from "@/lib/duolingo/audio-cache";
import { validateExerciseContent } from "@/lib/duolingo/validation";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function toInteger(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return rounded < 1 ? fallback : rounded;
}

function normalizeSkillTag(value) {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return null;
  return EXERCISE_SKILL_TAG_VALUES.includes(normalized) ? normalized : null;
}

function derivePrompt(content) {
  return (
    cleanText(content?.prompt_native) ||
    cleanText(content?.question_native) ||
    cleanText(content?.sentence) ||
    cleanText(content?.text_target) ||
    "Exercise"
  );
}

export async function prepareExercisePayload({
  input,
  actorId,
  db,
  forcePublishValidation = false,
}) {
  const status = cleanText(input?.status || "draft").toLowerCase() || "draft";
  const validation = validateExerciseContent({
    type: input?.type,
    contentJson: input?.content_json,
  });

  if (!validation.valid && (forcePublishValidation || status === "published")) {
    const message = validation.errors.join(" ") || "content_json inválido";
    throw new Error(message);
  }

  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const normalizedContent = { ...validation.normalizedContent };
  const skillTag = normalizeSkillTag(input?.skill_tag || input?.skillTag);
  if (!skillTag) {
    throw new Error("skill_tag es obligatorio: speaking, reading o grammar.");
  }

  if (validation.normalizedType === "audio_match" && status === "published") {
    const shouldGenerate = !normalizedContent.audio_url && !normalizedContent.r2_key && normalizedContent.text_target;
    if (shouldGenerate) {
      const audio = await ensureElevenLabsAudio({
        text: normalizedContent.text_target,
        language: input?.language || "en",
        voiceId: input?.voice_id || normalizedContent.voice_id,
        modelId: input?.model_id || normalizedContent.model_id,
        serviceClient: db,
      });

      if (audio?.audioUrl) {
        normalizedContent.audio_url = audio.audioUrl;
      }
      if (audio?.r2Key) {
        normalizedContent.r2_key = audio.r2Key;
      }
      normalizedContent.provider = audio?.provider || "elevenlabs";
      normalizedContent.voice_id = input?.voice_id || normalizedContent.voice_id || null;
      normalizedContent.model_id = input?.model_id || normalizedContent.model_id || null;
    }
  }

  const type = validation.normalizedType;
  const prompt = derivePrompt(normalizedContent);

  return {
    lesson_id: input?.lesson_id,
    type,
    skill_tag: skillTag,
    kind: LEGACY_KIND_BY_TYPE[type] || "multiple_choice",
    status,
    prompt,
    payload: normalizedContent,
    content_json: normalizedContent,
    ordering: toInteger(input?.ordering, 1),
    revision: toInteger(input?.revision, 1),
    updated_at: new Date().toISOString(),
    updated_by: actorId || null,
    last_editor: actorId || null,
    published_at: status === "published" ? new Date().toISOString() : null,
  };
}

export async function syncExerciseVocabulary({ db, exerciseId, vocabularyIds }) {
  const ids = Array.isArray(vocabularyIds)
    ? vocabularyIds.map((value) => cleanText(value)).filter(Boolean)
    : [];

  await db.from("exercise_vocabulary").delete().eq("exercise_id", exerciseId);

  if (!ids.length) {
    return;
  }

  const rows = ids.map((vocabId) => ({
    exercise_id: exerciseId,
    vocab_id: vocabId,
  }));

  const { error } = await db.from("exercise_vocabulary").insert(rows);
  if (error) {
    throw new Error(error.message || "No se pudo guardar relación ejercicio-vocabulario.");
  }
}

export function mapExerciseResponse(row) {
  return {
    id: row?.id,
    lesson_id: row?.lesson_id,
    type: row?.type,
    skill_tag: row?.skill_tag || null,
    status: row?.status,
    ordering: row?.ordering,
    revision: row?.revision,
    content_json: row?.content_json || row?.payload || {},
    updated_at: row?.updated_at,
    published_at: row?.published_at,
  };
}

