import { normalizeTitle } from "./titleNormalize.js";

export const state = {
  settings: { username: "", lang: "es" },
  index: { datasetVersion: null, lastUpdated: null, quests: [] },
  runemetricsStatus: new Map(), // questId -> { status, userEligible }
  playerLevels: null, // { levelsBySkill: Map<string, number>, combatLevel } | null
  // Matches RS3's own quest journal filter panel exactly (4 checkboxes, no
  // search box): showQuest/showMiniquest gate by type (a quest with neither
  // checked shows nothing, regardless of status); showLocked/showCompleted
  // each add that specific status subset. "Available" (not locked, not
  // completed) has no checkbox of its own — it's always shown whenever its
  // type is checked, same as in-game.
  activeFilters: {
    showLocked: true,
    showCompleted: true,
    showQuest: true,
    showMiniquest: true,
  },
  sortMode: "alphabetical",
  selectedQuestId: null,
};

/**
 * Resolves a quest's status, defaulting to NOT_STARTED when RuneMetrics has no
 * entry for it (or no RSN is set). Only COMPLETED/STARTED/NOT_STARTED come from
 * RuneMetrics — its userEligible field was found to be unreliable (a real quest
 * showed userEligible:false while actually available in-game), so it's not used.
 * The separate "locked" (grey) look shown in the sidebar for seasonal quests is
 * computed from our own isSeasonal flag instead (see sidebar.js), not from here.
 */
export function questStatus(questId) {
  const entry = state.runemetricsStatus.get(questId);
  if (!entry) return "NOT_STARTED";
  return entry.status || "NOT_STARTED";
}

/**
 * Whether a RuneScape username is configured, i.e. whether progress data is
 * real (synced with RuneMetrics) or just the unconfigured default. Used to
 * show a neutral "not synced yet" look instead of a wall of red "incomplete"
 * quests on first run, before the user has set anything in Ajustes.
 */
export function isSynced() {
  return Boolean(state.settings.username && state.settings.username.trim());
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

/**
 * Whether a quest is currently "Locked" (RS3's own quest-journal sense: some
 * requirement isn't met yet), for the sidebar's "Show Locked" filter. Walks
 * every node of the requirement tree at every depth, not just the top level —
 * the wiki's own tree sometimes nests a real, independent requirement one
 * level under an unrelated quest (e.g. Pieces of Hate's "own a
 * player-owned house" nested under "A Clockwork Syringe") rather than always
 * meaning strict transitive implication. An unmet/unknown skill or quest
 * requirement anywhere in the tree marks it locked; a fully-unknown check
 * (no RSN configured, or player levels not loaded) is treated as NOT locked —
 * we'd rather under- than over-report locked without real data.
 */
export function isQuestLocked(quest) {
  const skills = quest.requirements?.skills || [];
  for (const req of skills) {
    if (meetsSkillRequirement(req) === false) return true;
  }
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (meetsQuestRequirement(node.matchTitle || node.title) === false) return true;
      if (node.children && walk(node.children)) return true;
    }
    return false;
  };
  return walk(quest.requirements?.quests);
}
