import { FLASHCARD_GAME_MODES } from "@/lib/flashcard-arcade/constants";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeFlashcardProgressRow(row) {
  return {
    userId: row?.user_id || null,
    flashcardId: String(row?.flashcard_id || "").trim(),
    seenCount: Math.max(0, Number(row?.seen_count || 0) || 0),
    correctCount: Math.max(0, Number(row?.correct_count || 0) || 0),
    incorrectCount: Math.max(0, Number(row?.incorrect_count || 0) || 0),
    masteryScore: clamp(Math.round(Number(row?.mastery_score || 0) || 0), 0, 100),
    masteryStage: String(row?.mastery_stage || "new").trim().toLowerCase() || "new",
    lastGameMode: String(row?.last_game_mode || "").trim().toLowerCase() || null,
    lastPracticedAt: row?.last_practiced_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

export function deriveMasteryStage({ masteryScore = 0, seenCount = 0 }) {
  const score = clamp(Math.round(Number(masteryScore || 0) || 0), 0, 100);
  const seen = Math.max(0, Number(seenCount || 0) || 0);

  if (!seen) return "new";
  if (score >= 85) return "mastered";
  if (score >= 70) return "strong";
  if (score >= 50) return "review";
  return "learning";
}

export function calculateMasteryScore({
  seenCount = 0,
  correctCount = 0,
  incorrectCount = 0,
}) {
  const seen = Math.max(0, Number(seenCount || 0) || 0);
  const correct = Math.max(0, Number(correctCount || 0) || 0);
  const incorrect = Math.max(0, Number(incorrectCount || 0) || 0);

  if (!seen) return 0;

  const accuracy = correct / Math.max(1, seen);
  const familiarityBoost = Math.min(18, seen * 3);
  const accuracyScore = accuracy * 72;
  const balanceBoost = Math.max(-18, Math.min(10, (correct - incorrect) * 3));

  return clamp(Math.round(accuracyScore + familiarityBoost + balanceBoost), 0, 100);
}

export function buildFlashcardProgressUpdate(existingRow, delta = {}) {
  const current = normalizeFlashcardProgressRow(existingRow);
  const seenCount = current.seenCount + Math.max(0, Number(delta?.seenCount || 0) || 0);
  const correctCount = current.correctCount + Math.max(0, Number(delta?.correctCount || 0) || 0);
  const incorrectCount = current.incorrectCount + Math.max(0, Number(delta?.incorrectCount || 0) || 0);
  const masteryScore = calculateMasteryScore({
    seenCount,
    correctCount,
    incorrectCount,
  });

  return {
    seenCount,
    correctCount,
    incorrectCount,
    masteryScore,
    masteryStage: deriveMasteryStage({ masteryScore, seenCount }),
  };
}

export function buildDeckProgressSummary(cards = [], progressMap = new Map()) {
  const sourceCards = Array.isArray(cards) ? cards : [];
  const totalCards = sourceCards.length;
  if (!totalCards) {
    return {
      totalCards: 0,
      seenCards: 0,
      masteredCards: 0,
      strongCards: 0,
      weakCards: 0,
      averageMastery: 0,
      completionPercent: 0,
    };
  }

  let seenCards = 0;
  let masteredCards = 0;
  let strongCards = 0;
  let weakCards = 0;
  let masteryTotal = 0;

  for (const card of sourceCards) {
    const flashcardId = String(card?.flashcardId || card?.id || "").trim();
    const progress = normalizeFlashcardProgressRow(progressMap.get(flashcardId));
    masteryTotal += progress.masteryScore;

    if (progress.seenCount > 0) {
      seenCards += 1;
    }
    if (progress.masteryStage === "mastered") {
      masteredCards += 1;
    }
    if (["strong", "mastered"].includes(progress.masteryStage)) {
      strongCards += 1;
    }
    if (progress.seenCount > 0 && progress.masteryScore < 50) {
      weakCards += 1;
    }
  }

  return {
    totalCards,
    seenCards,
    masteredCards,
    strongCards,
    weakCards,
    averageMastery: clamp(Math.round(masteryTotal / totalCards), 0, 100),
    completionPercent: clamp(Math.round((seenCards / totalCards) * 100), 0, 100),
  };
}

export function calculateFlashcardAccuracyPercent({ totalPrompts = 0, correctAnswers = 0 }) {
  const total = Math.max(0, Number(totalPrompts || 0) || 0);
  if (!total) return 0;
  const correct = Math.max(0, Number(correctAnswers || 0) || 0);
  return clamp(Math.round((correct / total) * 100), 0, 100);
}

export function calculateFlashcardSessionXp({
  mode = FLASHCARD_GAME_MODES.STUDY,
  totalPrompts = 0,
  correctAnswers = 0,
  completed = true,
  comboMax = 0,
  uniqueCards = 0,
}) {
  const safeMode = String(mode || FLASHCARD_GAME_MODES.STUDY).trim().toLowerCase();
  const total = Math.max(0, Number(totalPrompts || 0) || 0);
  const correct = Math.max(0, Number(correctAnswers || 0) || 0);
  const accuracy = calculateFlashcardAccuracyPercent({ totalPrompts: total, correctAnswers: correct });
  if (!completed || !total) {
    return {
      xpEarned: 0,
      accuracyPercent: accuracy,
      bonusBreakdown: [],
    };
  }

  const perCorrect = {
    [FLASHCARD_GAME_MODES.STUDY]: 1,
    [FLASHCARD_GAME_MODES.SPEED_MATCH]: 5,
    [FLASHCARD_GAME_MODES.WRITING_SPRINT]: 6,
    [FLASHCARD_GAME_MODES.MEMORY_GRID]: 4,
    [FLASHCARD_GAME_MODES.SURVIVAL]: 6,
  }[safeMode] || 4;

  const bonuses = [];
  let xp = correct * perCorrect;

  if (safeMode === FLASHCARD_GAME_MODES.STUDY) {
    const studyFinishBonus = Math.min(12, Math.max(4, uniqueCards));
    xp += studyFinishBonus;
    bonuses.push({ label: "deck_finish", value: studyFinishBonus });
  } else {
    xp += 8;
    bonuses.push({ label: "finish", value: 8 });
  }

  if (accuracy >= 98) {
    xp += 14;
    bonuses.push({ label: "perfect", value: 14 });
  } else if (accuracy >= 90) {
    xp += 9;
    bonuses.push({ label: "great_accuracy", value: 9 });
  } else if (accuracy >= 80) {
    xp += 5;
    bonuses.push({ label: "solid_accuracy", value: 5 });
  }

  if (safeMode === FLASHCARD_GAME_MODES.SPEED_MATCH || safeMode === FLASHCARD_GAME_MODES.SURVIVAL) {
    const comboBonus = clamp(Math.floor(Number(comboMax || 0) / 3), 0, 10);
    if (comboBonus > 0) {
      xp += comboBonus;
      bonuses.push({ label: "combo", value: comboBonus });
    }
  }

  const completionBonus = Math.min(10, Math.max(0, Math.floor(Number(uniqueCards || 0) / 4)));
  if (completionBonus > 0 && safeMode !== FLASHCARD_GAME_MODES.STUDY) {
    xp += completionBonus;
    bonuses.push({ label: "coverage", value: completionBonus });
  }

  const capped = clamp(Math.round(xp), 0, safeMode === FLASHCARD_GAME_MODES.STUDY ? 24 : 120);
  return {
    xpEarned: capped,
    accuracyPercent: accuracy,
    bonusBreakdown: bonuses,
  };
}

