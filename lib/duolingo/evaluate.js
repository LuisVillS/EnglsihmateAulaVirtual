import { EXERCISE_TYPES } from "@/lib/duolingo/constants";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evaluateScramble(content, answer) {
  const targetWords = Array.isArray(content?.target_words) ? content.target_words : [];
  const answerOrder = Array.isArray(content?.answer_order) ? content.answer_order : [];
  const selectedOrder = Array.isArray(answer?.selected_order) ? answer.selected_order : [];

  const expected = answerOrder.map((index) => targetWords[index]).join(" ");
  const actual = selectedOrder.map((index) => targetWords[index]).join(" ");
  return normalizeText(expected) === normalizeText(actual);
}

function evaluateAudioMatch(content, answer) {
  if (content?.mode === "translation") {
    const selectedIndex = Number(answer?.selected_index);
    return Number.isInteger(selectedIndex) && selectedIndex === Number(content?.correct_index);
  }

  const expected = normalizeText(content?.text_target || "");
  const actual = normalizeText(answer?.text || "");
  return Boolean(expected && actual && expected === actual);
}

function evaluateImageMatch(content, answer) {
  const selectedVocabId = String(answer?.selected_vocab_id || "").trim();
  const selectedIndex = Number(answer?.selected_index);

  if (content?.correct_vocab_id) {
    return selectedVocabId && selectedVocabId === String(content.correct_vocab_id);
  }

  return Number.isInteger(selectedIndex) && selectedIndex === Number(content?.correct_index);
}

function evaluatePairs(content, answer) {
  const expected = Array.isArray(content?.pairs) ? content.pairs.length : 0;
  const matched = Number(answer?.matched_pairs || 0);
  return expected > 0 && matched >= expected;
}

function evaluateCloze(content, answer) {
  const options = Array.isArray(content?.options) ? content.options : [];
  if (options.length) {
    const selectedIndex = Number(answer?.selected_index);
    return Number.isInteger(selectedIndex) && selectedIndex === Number(content?.correct_index);
  }

  const expected = normalizeText(content?.answer || "");
  const actual = normalizeText(answer?.text || "");
  return Boolean(expected && actual && expected === actual);
}

export function evaluateExerciseAnswer({ type, content, answer }) {
  const normalizedType = String(type || "").toLowerCase();

  switch (normalizedType) {
    case EXERCISE_TYPES.SCRAMBLE:
      return evaluateScramble(content, answer);
    case EXERCISE_TYPES.AUDIO_MATCH:
      return evaluateAudioMatch(content, answer);
    case EXERCISE_TYPES.IMAGE_MATCH:
      return evaluateImageMatch(content, answer);
    case EXERCISE_TYPES.PAIRS:
      return evaluatePairs(content, answer);
    case EXERCISE_TYPES.CLOZE:
      return evaluateCloze(content, answer);
    default:
      return false;
  }
}

export { normalizeText };

