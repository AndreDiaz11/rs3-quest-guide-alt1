import { wikiApiFetch } from "./wikiApi.js";

/**
 * Enumerates every quest/miniquest that has a Quick guide page, via
 * Category:Quick guides (confirmed to return all ~368 entries in one call,
 * no pagination needed at cmlimit=500). Titles come back as "X/Quick guide";
 * this strips the suffix to get the canonical quest title.
 */
export async function fetchQuestList() {
  const response = await wikiApiFetch({
    action: "query",
    list: "categorymembers",
    cmtitle: "Category:Quick guides",
    cmlimit: "500",
  });

  const members = response?.query?.categorymembers || [];
  return members
    .map((m) => m.title)
    .filter((title) => title.endsWith("/Quick guide"))
    .map((title) => title.replace(/\/Quick guide$/, ""));
}

// A handful of non-quest meta/list pages share Category:Quests with the
// actual quest articles (e.g. "Quest Overview", "Quest points", "List of
// quests and miniquests by age") — confirmed by inspecting the category's
// full member list; these titles never change, so a fixed exclusion list is
// safe and cheaper than trying to detect them structurally.
const NON_QUEST_TITLES = new Set([
  "Quest Overview",
  "Quest points",
  "QuestHelp",
  "Quests",
  "Quests/Skill requirements",
  "RuneMetrics/Quest complete",
  "Seasonal quests",
  "Special quest",
]);

/**
 * Enumerates every FULL quest article via Category:Quests — unlike
 * fetchQuestList() above, this finds a quest the moment its own page exists,
 * even before the wiki community has written (and categorized) its Quick
 * guide. Doesn't include miniquests/sagas (a separate, uncategorized-here
 * convention) — those are still only found once their own Quick guide shows
 * up in Category:Quick guides, same as before.
 */
export async function fetchAllQuestTitles() {
  const response = await wikiApiFetch({
    action: "query",
    list: "categorymembers",
    cmtitle: "Category:Quests",
    cmlimit: "500",
    cmnamespace: "0",
  });

  const members = response?.query?.categorymembers || [];
  return members
    .map((m) => m.title)
    .filter((title) => !NON_QUEST_TITLES.has(title) && !/^List of /i.test(title) && !title.startsWith("Quests/"));
}
