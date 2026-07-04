/**
 * Normalizes a quest title for matching across sources (our dataset, RuneMetrics,
 * requirement text): lowercase, strip accents, drop wiki disambiguation suffixes
 * ("(miniquest)", "(quest)"), collapse punctuation to spaces.
 */
export function normalizeTitle(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*\((miniquest|quest)\)\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
