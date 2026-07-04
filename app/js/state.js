export const state = {
  settings: { username: "", lang: "es" },
  index: { datasetVersion: null, lastUpdated: null, quests: [] },
  runemetricsStatus: new Map(), // questId -> { status, userEligible }
  // 3 casilleros independientes sobre 3 grupos que no se solapan (ver
  // questBucket en sidebar.js): completada / incompleta normal / evento no
  // completado. Apagar los 3 vacía la lista; encender los 3 muestra todo.
  activeFilters: {
    searchText: "",
    showCompleted: true,
    showIncomplete: true,
    showEvents: false,
  },
  selectedQuestId: null,
};

/**
 * Resolves a quest's status, defaulting to NOT_STARTED when RuneMetrics has no
 * entry for it (or no RSN is set). Only COMPLETED/STARTED/NOT_STARTED come from
 * RuneMetrics — its userEligible field was found to be unreliable (a real quest
 * showed userEligible:false while actually available in-game), so it's not used.
 * The separate "locked" (grey) look shown in the sidebar for seasonal quests is
 * computed from our own isSeasonal flag instead (see colors.js), not from here.
 */
export function questStatus(questId) {
  const entry = state.runemetricsStatus.get(questId);
  if (!entry) return "NOT_STARTED";
  return entry.status || "NOT_STARTED";
}
