import { loadCompetitionHubData } from "@/lib/competition/service";
import { loadFlashcardArcadeSectionData } from "@/lib/flashcard-arcade/service";
import { loadPracticeSectionData } from "@/lib/practice-hub";

export async function loadTrainingHubData(db, { userId, legacyXpTotal = 0, courseLevel = "" } = {}) {
  const [competition, practice, flashcards] = await Promise.all([
    loadCompetitionHubData(db, {
      userId,
      legacyXpTotal,
    }),
    loadPracticeSectionData(db, { userId, courseLevel }),
    loadFlashcardArcadeSectionData(db, { userId, courseLevel }),
  ]);

  return {
    gamification: competition?.gamification || null,
    competition,
    practice,
    flashcards,
  };
}

export async function loadLeaderboardData(db, { userId, legacyXpTotal = 0 } = {}) {
  return loadCompetitionHubData(db, {
    userId,
    legacyXpTotal,
  });
}
