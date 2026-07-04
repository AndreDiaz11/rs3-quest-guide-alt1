let aliasesPromise = null;

async function loadAliases() {
  if (!aliasesPromise) {
    aliasesPromise = fetch("data/aliases.json")
      .then((res) => res.json())
      .catch(() => ({}));
  }
  return aliasesPromise;
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Strips RuneMetrics's "(miniquest)" suffix, returning the base title + a flag. */
export function splitMiniquestSuffix(runeMetricsTitle) {
  const match = runeMetricsTitle.match(/^(.*)\s\(miniquest\)$/i);
  return match ? { title: match[1], isMiniquest: true } : { title: runeMetricsTitle, isMiniquest: false };
}

/**
 * Builds a lookup from normalized dataset title -> quest id, then matches
 * RuneMetrics entries against it (alias map first, then normalized string
 * match). Returns Map<questId, { status, userEligible, isMiniquestRM }>.
 */
export async function matchRuneMetricsToDataset(runeMetricsQuests, datasetQuests) {
  const aliases = await loadAliases();
  const byId = new Map(datasetQuests.map((q) => [q.id, q]));
  const byNormalizedTitle = new Map();
  for (const quest of datasetQuests) {
    byNormalizedTitle.set(normalizeTitle(quest.title), quest.id);
  }

  const result = new Map();
  const unmatched = [];
  const miniquestDrift = [];

  for (const rmQuest of runeMetricsQuests) {
    const { title: baseTitle, isMiniquest } = splitMiniquestSuffix(rmQuest.title);

    let questId = aliases[rmQuest.title] || aliases[baseTitle];
    if (!questId) questId = byNormalizedTitle.get(normalizeTitle(baseTitle));

    if (!questId) {
      unmatched.push(rmQuest.title);
      continue;
    }

    // Cross-check: the wiki and RuneMetrics should agree on quest vs miniquest.
    // A mismatch usually means the title match landed on the wrong entry.
    const datasetQuest = byId.get(questId);
    if (datasetQuest && datasetQuest.isMiniquest !== isMiniquest) {
      miniquestDrift.push(rmQuest.title);
    }

    result.set(questId, {
      status: rmQuest.status,
      userEligible: rmQuest.userEligible,
    });
  }

  if (unmatched.length > 0) {
    console.warn("[matching] Misiones de RuneMetrics sin match en el dataset:", unmatched);
  }
  if (miniquestDrift.length > 0) {
    console.warn(
      "[matching] Misiones donde el wiki y RuneMetrics no coinciden en si es minimisión (revisar aliases.json):",
      miniquestDrift
    );
  }

  return result;
}
