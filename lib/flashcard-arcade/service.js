import {
  FLASHCARD_DECK_KEY_PREFIXES,
  FLASHCARD_DECK_SOURCE_TYPES,
  buildSavedDeckKey,
  buildSessionDeckKey,
  buildWeaknessDeckKey,
  parseDeckKey,
} from "@/lib/flashcard-arcade/constants";
import {
  buildDeckProgressSummary,
  normalizeFlashcardProgressRow,
} from "@/lib/flashcard-arcade/progress";
import {
  buildFlashcardLibraryMap,
  resolveAssignedFlashcardRow,
} from "@/lib/flashcards";
import { ensureGamificationProfile } from "@/lib/gamification/profile";
import { loadCompetitionSummary } from "@/lib/competition/service";
import { formatStudentThemeLabel, normalizeStudentCefrLevel } from "@/lib/student-levels";

function formatShortDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function buildSessionDeckTitle(session) {
  const index = Number(session?.session_index || 0) || null;
  const dateLabel = formatShortDate(session?.starts_at || session?.session_date);
  if (index && dateLabel) {
    return `Session ${index} - ${dateLabel}`;
  }
  if (index) {
    return `Session ${index}`;
  }
  if (dateLabel) {
    return `Session - ${dateLabel}`;
  }
  return "Session Deck";
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function buildLegacyFlashcardKey(row) {
  const word = String(row?.word || "").trim().toLowerCase();
  const meaning = String(row?.meaning || "").trim().toLowerCase();
  const image = String(row?.image_url || row?.image || "").trim();
  if (!word || !meaning || !image) return "";
  return `${word}|||${meaning}|||${image}`;
}

async function loadUserCommissionId(db, userId) {
  const { data, error } = await db
    .from("profiles")
    .select("commission_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo resolver la comision del estudiante.");
  }

  return data?.commission_id || null;
}

async function loadFlashcardAssignmentsBySessionIds(db, sessionIds = []) {
  const ids = uniqueStrings(sessionIds);
  if (!ids.length) {
    return new Map();
  }

  const { data: assignmentRows, error: assignmentError } = await db
    .from("session_flashcards")
    .select("id, session_id, flashcard_id, word, meaning, image_url, card_order, accepted_answers")
    .in("session_id", ids)
    .order("card_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (assignmentError) {
    throw new Error(assignmentError.message || "No se pudieron cargar las flashcards de clase.");
  }

  const flashcardIds = uniqueStrings((assignmentRows || []).map((row) => row?.flashcard_id));
  let flashcardsById = new Map();
  let legacyLibraryByKey = new Map();

  if (flashcardIds.length) {
    const { data: libraryRows, error: libraryError } = await db
      .from("flashcards")
      .select("id, word, meaning, image_url, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config, cefr_level, theme_tag")
      .in("id", flashcardIds);

    if (libraryError) {
      throw new Error(libraryError.message || "No se pudo cargar la biblioteca de flashcards.");
    }

    flashcardsById = buildFlashcardLibraryMap(libraryRows || []);
  }

  const legacyRows = (assignmentRows || []).filter((row) => !String(row?.flashcard_id || "").trim());
  const legacyWords = uniqueStrings(legacyRows.map((row) => row?.word));
  if (legacyWords.length) {
    const { data: legacyLibraryRows, error: legacyLibraryError } = await db
      .from("flashcards")
      .select("id, word, meaning, image_url, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config, cefr_level, theme_tag")
      .in("word", legacyWords);

    if (legacyLibraryError) {
      throw new Error(legacyLibraryError.message || "No se pudieron resolver las flashcards heredadas.");
    }

    legacyLibraryByKey = new Map(
      (legacyLibraryRows || [])
        .map((row) => [buildLegacyFlashcardKey(row), row])
        .filter(([key]) => Boolean(key))
    );
    for (const row of legacyLibraryRows || []) {
      flashcardsById.set(String(row?.id || "").trim(), row);
    }
  }

  const bySession = new Map();
  for (const row of assignmentRows || []) {
    const sessionId = String(row?.session_id || "").trim();
    if (!sessionId) continue;
    const list = bySession.get(sessionId) || [];
    const legacyMatch = !String(row?.flashcard_id || "").trim()
      ? legacyLibraryByKey.get(buildLegacyFlashcardKey(row)) || null
      : null;
    const normalizedRow = legacyMatch
      ? {
          ...row,
          flashcard_id: legacyMatch.id,
        }
      : row;
    list.push(resolveAssignedFlashcardRow(normalizedRow, flashcardsById, list.length + 1));
    bySession.set(sessionId, list);
  }

  return bySession;
}

async function loadSessionDeckDrafts(db, { userId, sessionId = null, courseLevel = "" } = {}) {
  const commissionId = await loadUserCommissionId(db, userId);
  if (!commissionId) {
    return [];
  }

  const cefrLevel = normalizeStudentCefrLevel(courseLevel);

  let sessionQuery = db
    .from("course_sessions")
    .select("id, session_index, session_date, starts_at")
    .eq("commission_id", commissionId)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("session_date", { ascending: true });

  if (sessionId) {
    sessionQuery = sessionQuery.eq("id", sessionId);
  }

  const { data: sessionRows, error: sessionError } = await sessionQuery;
  if (sessionError) {
    throw new Error(sessionError.message || "No se pudieron cargar las sesiones con flashcards.");
  }

  const sessions = sessionRows || [];
  const sessionIds = uniqueStrings(sessions.map((row) => row?.id));
  const assignmentsBySession = await loadFlashcardAssignmentsBySessionIds(db, sessionIds);

  return sessions
    .map((session) => {
      const currentSessionId = String(session?.id || "").trim();
      const cards = assignmentsBySession.get(currentSessionId) || [];
      if (!cards.length) {
        return null;
      }

      return {
        deckId: null,
        deckKey: buildSessionDeckKey(currentSessionId),
        title: buildSessionDeckTitle(session),
        description: "Assigned flashcards from your live course session.",
        sourceType: FLASHCARD_DECK_SOURCE_TYPES.SESSION,
        sourceLabel: "My course",
        cefrLevel,
        themeTag: "",
        cards,
        metadata: {
          sessionId: currentSessionId,
        },
      };
    })
    .filter(Boolean);
}

async function loadSavedDeckDrafts(db, { deckId = null, courseLevel = "" } = {}) {
  const cefrLevel = normalizeStudentCefrLevel(courseLevel);
  let deckQuery = db
    .from("flashcard_decks")
    .select("id, title, description, source_type, cefr_level, theme_tag, scenario_tag, metadata")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (deckId) {
    deckQuery = deckQuery.eq("id", deckId);
  }
  if (cefrLevel) {
    deckQuery = deckQuery.eq("cefr_level", cefrLevel);
  }

  const { data: deckRows, error: deckError } = await deckQuery;
  if (deckError) {
    throw new Error(deckError.message || "No se pudieron cargar los decks de flashcards.");
  }

  const decks = deckRows || [];
  if (!decks.length) {
    return [];
  }

  const deckIds = uniqueStrings(decks.map((row) => row?.id));
  const { data: itemRows, error: itemError } = await db
    .from("flashcard_deck_items")
    .select("deck_id, flashcard_id, position")
    .in("deck_id", deckIds)
    .order("position", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message || "No se pudieron cargar los items del deck.");
  }

  const flashcardIds = uniqueStrings((itemRows || []).map((row) => row?.flashcard_id));
  let flashcardsById = new Map();

  if (flashcardIds.length) {
    const { data: flashcardRows, error: flashcardError } = await db
      .from("flashcards")
      .select("id, word, meaning, image_url, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config, cefr_level, theme_tag")
      .in("id", flashcardIds);

    if (flashcardError) {
      throw new Error(flashcardError.message || "No se pudieron cargar las flashcards del deck.");
    }

    flashcardsById = buildFlashcardLibraryMap(flashcardRows || []);
  }

  const cardsByDeck = new Map();
  for (const item of itemRows || []) {
    const deckKey = String(item?.deck_id || "").trim();
    const card = flashcardsById.get(String(item?.flashcard_id || "").trim()) || null;
    if (!deckKey || !card) continue;
    const list = cardsByDeck.get(deckKey) || [];
    list.push({
      ...card,
      order: Number(item?.position || list.length + 1) || list.length + 1,
    });
    cardsByDeck.set(deckKey, list);
  }

  return decks
    .map((deck) => {
      const currentDeckId = String(deck?.id || "").trim();
      const cards = cardsByDeck.get(currentDeckId) || [];
      if (!cards.length) {
        return null;
      }

      return {
        deckId: currentDeckId,
        deckKey: buildSavedDeckKey(currentDeckId),
        title: String(deck?.title || "").trim() || "Flashcard Deck",
        description: String(deck?.description || "").trim(),
        sourceType: String(deck?.source_type || FLASHCARD_DECK_SOURCE_TYPES.SYSTEM).trim().toLowerCase(),
        sourceLabel: formatStudentThemeLabel(deck?.theme_tag) || "Level deck",
        cefrLevel: String(deck?.cefr_level || "").trim().toUpperCase(),
        themeTag: String(deck?.theme_tag || "").trim().toLowerCase(),
        cards,
        metadata: deck?.metadata || {},
      };
    })
    .filter(Boolean);
}

async function loadUserFlashcardProgressMap(db, { userId, flashcardIds = [] } = {}) {
  const ids = uniqueStrings(flashcardIds);
  if (!ids.length) {
    return new Map();
  }

  const { data, error } = await db
    .from("user_flashcard_progress")
    .select("*")
    .eq("user_id", userId)
    .in("flashcard_id", ids);

  if (error) {
    throw new Error(error.message || "No se pudo cargar el progreso de flashcards.");
  }

  return new Map(
    (data || [])
      .map((row) => normalizeFlashcardProgressRow(row))
      .filter((row) => row.flashcardId)
      .map((row) => [row.flashcardId, row])
  );
}

function decorateDeck(deck, progressMap) {
  const cards = (Array.isArray(deck?.cards) ? deck.cards : [])
    .map((card, index) => {
      const flashcardId = String(card?.flashcardId || card?.id || "").trim();
      const progress = normalizeFlashcardProgressRow(progressMap.get(flashcardId));
      return {
        ...card,
        id: String(card?.id || flashcardId || `flashcard-${index + 1}`),
        flashcardId,
        order: Number(card?.order || index + 1) || index + 1,
        progress,
      };
    })
    .sort((left, right) => left.order - right.order);

  return {
    ...deck,
    cards,
    stats: buildDeckProgressSummary(cards, progressMap),
  };
}

function toDeckSummary(deck) {
  return {
    deckId: deck?.deckId || null,
    deckKey: deck?.deckKey || "",
    title: deck?.title || "Flashcards",
    description: deck?.description || "",
    sourceType: deck?.sourceType || FLASHCARD_DECK_SOURCE_TYPES.SYSTEM,
    sourceLabel: deck?.sourceLabel || "",
    cefrLevel: String(deck?.cefrLevel || "").trim().toUpperCase(),
    themeTag: String(deck?.themeTag || "").trim().toLowerCase(),
    totalCards: Number(deck?.stats?.totalCards || 0) || 0,
    seenCards: Number(deck?.stats?.seenCards || 0) || 0,
    masteredCards: Number(deck?.stats?.masteredCards || 0) || 0,
    strongCards: Number(deck?.stats?.strongCards || 0) || 0,
    weakCards: Number(deck?.stats?.weakCards || 0) || 0,
    averageMastery: Number(deck?.stats?.averageMastery || 0) || 0,
    completionPercent: Number(deck?.stats?.completionPercent || 0) || 0,
  };
}

function buildWeaknessDeck(decks, progressMap) {
  const cardMap = new Map();

  for (const deck of decks) {
    for (const card of deck?.cards || []) {
      const flashcardId = String(card?.flashcardId || card?.id || "").trim();
      const progress = normalizeFlashcardProgressRow(progressMap.get(flashcardId));
      if (!flashcardId || progress.seenCount <= 0) continue;
      const weaknessScore =
        (100 - progress.masteryScore) +
        (progress.incorrectCount * 8) +
        (progress.correctCount < progress.incorrectCount ? 12 : 0);
      const current = cardMap.get(flashcardId);
      if (!current || weaknessScore > current.weaknessScore) {
        cardMap.set(flashcardId, {
          ...card,
          progress,
          weaknessScore,
        });
      }
    }
  }

  const selectedCards = Array.from(cardMap.values())
    .sort((left, right) => right.weaknessScore - left.weaknessScore)
    .slice(0, 15)
    .map((card, index) => ({
      ...card,
      order: index + 1,
    }));

  if (!selectedCards.length) {
    return null;
  }

  return decorateDeck(
    {
      deckId: null,
      deckKey: buildWeaknessDeckKey("assigned"),
      title: "Weak Cards Recovery",
      description: "Review the flashcards that still need extra attention.",
      sourceType: FLASHCARD_DECK_SOURCE_TYPES.WEAKNESS,
      sourceLabel: "Recommended",
      cefrLevel: "",
      themeTag: "",
      cards: selectedCards,
      metadata: {},
    },
    progressMap
  );
}

function pickRecommendedDeck(decks, weaknessDeck) {
  if (weaknessDeck?.cards?.length >= 4) {
    return toDeckSummary(weaknessDeck);
  }

  const candidates = [...(Array.isArray(decks) ? decks : [])]
    .filter((deck) => Number(deck?.stats?.totalCards || 0) > 0)
    .sort((left, right) => {
      if ((left.stats?.completionPercent || 0) !== (right.stats?.completionPercent || 0)) {
        return (left.stats?.completionPercent || 0) - (right.stats?.completionPercent || 0);
      }
      return (left.stats?.averageMastery || 0) - (right.stats?.averageMastery || 0);
    });

  return candidates[0] ? toDeckSummary(candidates[0]) : null;
}

async function loadRecentFlashcardSession(db, userId) {
  const { data, error } = await db
    .from("flashcard_game_sessions")
    .select("id, deck_key, deck_title, mode, accuracy_rate, xp_earned, score, completed_at, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo cargar la actividad reciente de flashcards.");
  }

  if (!data?.id) {
    return null;
  }

  return {
    id: data.id,
    deckKey: data.deck_key || "",
    deckTitle: data.deck_title || "Flashcards",
    mode: data.mode || "study",
    accuracyRate: Number(data.accuracy_rate || 0) || 0,
    xpEarned: Number(data.xp_earned || 0) || 0,
    score: Number(data.score || 0) || 0,
    completedAt: data.completed_at || null,
    startedAt: data.started_at || null,
  };
}

function sortDeckDrafts(decks = []) {
  const sourcePriority = {
    [FLASHCARD_DECK_SOURCE_TYPES.WEAKNESS]: 0,
    [FLASHCARD_DECK_SOURCE_TYPES.SYSTEM]: 1,
    [FLASHCARD_DECK_SOURCE_TYPES.THEME]: 1,
    [FLASHCARD_DECK_SOURCE_TYPES.SESSION]: 2,
  };

  return [...decks].sort((left, right) => {
    const sourceDiff = (sourcePriority[left?.sourceType] ?? 9) - (sourcePriority[right?.sourceType] ?? 9);
    if (sourceDiff !== 0) return sourceDiff;
    return String(left?.title || "").localeCompare(String(right?.title || ""), "en", { sensitivity: "base" });
  });
}

async function loadAllDeckDrafts(db, { userId, courseLevel = "" } = {}) {
  const [sessionDecks, savedDecks] = await Promise.all([
    loadSessionDeckDrafts(db, { userId, courseLevel }),
    loadSavedDeckDrafts(db, { courseLevel }),
  ]);

  return sortDeckDrafts([...savedDecks, ...sessionDecks]);
}

export async function loadFlashcardArcadeHubData(db, { userId, legacyXpTotal = 0, courseLevel = "" } = {}) {
  const gamification = await ensureGamificationProfile(db, {
    userId,
    legacyXpTotal,
  });
  const [sectionData, competition] = await Promise.all([
    loadFlashcardArcadeSectionData(db, { userId, courseLevel }),
    loadCompetitionSummary(db, {
      userId,
      legacyXpTotal,
    }),
  ]);

  return {
    gamification,
    competition,
    ...sectionData,
  };
}

export async function loadFlashcardArcadeSectionData(db, { userId, courseLevel = "" } = {}) {
  const allowedCefrLevel = normalizeStudentCefrLevel(courseLevel);
  const deckDrafts = await loadAllDeckDrafts(db, { userId, courseLevel });
  const flashcardIds = uniqueStrings(deckDrafts.flatMap((deck) => (deck.cards || []).map((card) => card?.flashcardId || card?.id)));
  const progressMap = await loadUserFlashcardProgressMap(db, { userId, flashcardIds });
  const decoratedDecks = deckDrafts.map((deck) => decorateDeck(deck, progressMap));
  const weaknessDeck = buildWeaknessDeck(decoratedDecks, progressMap);
  const recommendedDeck = pickRecommendedDeck(decoratedDecks, weaknessDeck);
  const recentSession = await loadRecentFlashcardSession(db, userId);

  const summaries = weaknessDeck
    ? [toDeckSummary(weaknessDeck), ...decoratedDecks.map((deck) => toDeckSummary(deck))]
    : decoratedDecks.map((deck) => toDeckSummary(deck));

  return {
    allowedCefrLevel,
    recommendedDeck,
    recentSession,
    decks: summaries,
  };
}

export async function loadFlashcardDeck(db, { userId, deckKey, courseLevel = "" } = {}) {
  const parsed = parseDeckKey(deckKey);
  let selectedDecks = [];

  if (parsed.kind === FLASHCARD_DECK_KEY_PREFIXES.SESSION) {
    selectedDecks = await loadSessionDeckDrafts(db, {
      userId,
      sessionId: parsed.identifier,
      courseLevel,
    });
  } else if (parsed.kind === FLASHCARD_DECK_KEY_PREFIXES.SAVED) {
    selectedDecks = await loadSavedDeckDrafts(db, {
      deckId: parsed.identifier,
      courseLevel,
    });
  } else if (parsed.kind === FLASHCARD_DECK_KEY_PREFIXES.WEAKNESS) {
    const deckDrafts = await loadAllDeckDrafts(db, { userId, courseLevel });
    const flashcardIds = uniqueStrings(deckDrafts.flatMap((deck) => (deck.cards || []).map((card) => card?.flashcardId || card?.id)));
    const progressMap = await loadUserFlashcardProgressMap(db, { userId, flashcardIds });
    const decoratedDecks = deckDrafts.map((deck) => decorateDeck(deck, progressMap));
    return buildWeaknessDeck(decoratedDecks, progressMap);
  } else {
    selectedDecks = await loadAllDeckDrafts(db, { userId, courseLevel });
  }

  const exactDeck =
    selectedDecks.find((deck) => String(deck?.deckKey || "").trim().toLowerCase() === parsed.raw) ||
    selectedDecks[0] ||
    null;

  if (!exactDeck) {
    return null;
  }

  const flashcardIds = uniqueStrings((exactDeck.cards || []).map((card) => card?.flashcardId || card?.id));
  const progressMap = await loadUserFlashcardProgressMap(db, { userId, flashcardIds });
  return decorateDeck(exactDeck, progressMap);
}

export async function createFlashcardGameSession(db, {
  userId,
  deck,
  mode,
  sourceContext = "flashcard_arcade",
} = {}) {
  if (!userId) {
    throw new Error("Falta userId para iniciar sesion de flashcards.");
  }
  if (!deck?.deckKey) {
    throw new Error("No se encontro el deck solicitado.");
  }

  const payload = {
    source_context: sourceContext,
  };

  const { data, error } = await db
    .from("flashcard_game_sessions")
    .insert({
      user_id: userId,
      deck_id: deck.deckId || null,
      deck_key: deck.deckKey,
      deck_title: deck.title || "Flashcards",
      source_type: deck.sourceType || FLASHCARD_DECK_SOURCE_TYPES.SYSTEM,
      mode,
      status: "active",
      payload,
      total_cards: Number(deck?.stats?.totalCards || deck?.cards?.length || 0) || 0,
      total_prompts: 0,
      correct_answers: 0,
      incorrect_answers: 0,
      accuracy_rate: 0,
      xp_earned: 0,
      score: 0,
      combo_max: 0,
      lives_left: mode === "survival" ? 3 : null,
    })
    .select("id, started_at")
    .single();

  if (error) {
    throw new Error(error.message || "No se pudo iniciar la sesion de flashcards.");
  }

  return {
    id: data.id,
    startedAt: data.started_at || null,
  };
}
