import { normalizeTitle } from "./titleNormalize.js";

export const state = {
  settings: { username: "", lang: "es" },
  index: { datasetVersion: null, lastUpdated: null, quests: [] },
  runemetricsStatus: new Map(), // questId -> { status, userEligible }
  playerLevels: null, // { levelsBySkill: Map<string, number>, combatLevel } | null
  // 3 casilleros independientes sobre 3 grupos que no se solapan (ver
  // questBucket en sidebar.js): completada / incompleta normal / evento no
  // completado. Apagar los 3 vacía la lista; encender los 3 muestra todo.
  activeFilters: {
    searchText: "",
    showCompleted: true,
    showIncomplete: true,
    showEvents: false,
    // Independiente de los 3 casilleros de arriba: si está apagado, oculta las
    // minimisiones sin importar en qué grupo caigan.
    showMiniquests: true,
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

/**
 * Whether the player's real level meets a skill requirement, e.g.
 * { skill: "Construction", level: 5 } or { skill: "combat level", level: 75 }.
 * Returns null (unknown) if we don't have the player's levels loaded yet.
 */
export function meetsSkillRequirement(requirement) {
  if (!state.playerLevels) return null;
  if (/combat level/i.test(requirement.skill)) {
    return state.playerLevels.combatLevel !== null ? state.playerLevels.combatLevel >= requirement.level : null;
  }
  const actual = state.playerLevels.levelsBySkill.get(requirement.skill);
  return actual === undefined ? null : actual >= requirement.level;
}

/** Whether a required quest (by wiki title) is already completed, matching against our own dataset. */
export function meetsQuestRequirement(requiredTitle) {
  const normalized = normalizeTitle(requiredTitle);
  const match = state.index.quests.find((q) => normalizeTitle(q.title) === normalized);
  if (!match) return null;
  return questStatus(match.id) === "COMPLETED";
}
