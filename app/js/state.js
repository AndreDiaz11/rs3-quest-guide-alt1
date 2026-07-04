export const state = {
  settings: { username: "", lang: "es" },
  index: { datasetVersion: null, lastUpdated: null, quests: [] },
  runemetricsStatus: new Map(), // questId -> { status, userEligible }
  activeFilters: {
    searchText: "",
    showCompleted: true,
  },
  selectedQuestId: null,
};

/**
 * Resolves a quest's status, defaulting to NOT_STARTED when RuneMetrics has no
 * entry for it (or no RSN is set). Deliberately only 3 states (COMPLETED,
 * STARTED, NOT_STARTED) — RuneMetrics's userEligible field was found to be
 * unreliable (a real quest showed userEligible:false while actually available
 * in-game), so we stopped trying to show a distinct "locked" state from it.
 */
export function questStatus(questId) {
  const entry = state.runemetricsStatus.get(questId);
  if (!entry) return "NOT_STARTED";
  return entry.status || "NOT_STARTED";
}
