export const state = {
  settings: { username: "", lang: "es" },
  index: { datasetVersion: null, lastUpdated: null, quests: [] },
  runemetricsStatus: new Map(), // questId -> { status, userEligible, isMiniquestRM }
  activeFilters: {
    sortBy: "alphabetical",
    showLocked: true,
    showCompleted: true,
    showQuests: true,
    showMiniquests: true,
    // Las misiones de temporada (Navidad, Pascua, etc.) solo están jugables
    // mientras el evento real está activo, así que el juego las oculta el
    // resto del año — igual por defecto aquí.
    showSeasonal: false,
  },
  selectedQuestId: null,
};

/** Resolves a quest's status, defaulting to NOT_STARTED when RuneMetrics has no entry for it (or no RSN is set). */
export function questStatus(questId) {
  const entry = state.runemetricsStatus.get(questId);
  if (!entry) return "NOT_STARTED";
  if (entry.userEligible === false) return "LOCKED";
  return entry.status || "NOT_STARTED";
}
