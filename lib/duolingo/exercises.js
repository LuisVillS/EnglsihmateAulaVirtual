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
  if (normalized === "speaking") return "listening";
  if (normalized === "writing") return "grammar";
  return EXERCISE_SKILL_TAG_VALUES.includes(normalized) ? normalized : null;
}

export function deriveExercisePrompt(type, content) {
  const normalizedType = cleanText(type).toLowerCase();

  if (normalizedType === "cloze") {
    return cleanText(content?.sentence) || "Exercise";
  }

  if (normalizedType === "scramble") {
    const targetWords = Array.isArray(content?.target_words)
      ? content.target_words.map((word) => cleanText(word)).filter(Boolean)
      : [];
    const answerOrder = Array.isArray(content?.answer_order)
      ? content.answer_order.map((value) => Number.parseInt(String(value ?? ""), 10))
      : [];
    const orderedWords = answerOrder.length === targetWords.length
      ? answerOrder.map((index) => targetWords[index]).filter(Boolean)
      : targetWords;
    return orderedWords.join(" ") || "Exercise";
  }

  if (normalizedType === "reading_exercise") {
    return cleanText(content?.reading_title) || cleanText(content?.title) || "Exercise";
  }

  if (normalizedType === "audio_match") {
    return cleanText(content?.listening_title) || cleanText(content?.title) || "Exercise";
  }

  if (normalizedType === "image_match") {
    const options = Array.isArray(content?.options) ? content.options : [];
    const correctVocabId = cleanText(content?.correct_vocab_id || content?.correctVocabId);
    const correctIndex = Number.parseInt(String(content?.correct_index ?? content?.correctIndex ?? ""), 10);
    let selectedOption = null;
    if (correctVocabId) {
      selectedOption = options.find((option) => cleanText(option?.vocab_id || option?.vocabId) === correctVocabId) || null;
    }
    if (!selectedOption && Number.isFinite(correctIndex) && correctIndex >= 0 && correctIndex < options.length) {
      selectedOption = options[correctIndex] || null;
    }
    return cleanText(selectedOption?.label) || "Exercise";
  }

  if (normalizedType === "pairs") {
    return cleanText(content?.pairs_title) || cleanText(content?.title) || "Exercise";
  }

  return (
    cleanText(content?.title) ||
    cleanText(content?.reading_title) ||
    cleanText(content?.text) ||
    cleanText(content?.reading_text) ||
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
    throw new Error("skill_tag es obligatorio: grammar, reading, listening o vocabulary.");
  }

  if (validation.normalizedType === "audio_match" && status === "published") {
    const shouldGenerate =
      !normalizedContent.youtube_url &&
      !normalizedContent.audio_url &&
      !normalizedContent.r2_key &&
      normalizedContent.text_target;
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
    } else if (normalizedContent.youtube_url) {
      normalizedContent.provider = "youtube";
      normalizedContent.source_type = "youtube";
    }
  }

  const type = validation.normalizedType;
  const prompt = deriveExercisePrompt(type, normalizedContent);

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

