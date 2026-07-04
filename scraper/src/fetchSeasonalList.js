import { wikiApiFetch } from "./wikiApi.js";

/** Titles of quests in Category:Seasonal quests (holiday/event quests only playable while the event is live). */
export async function fetchSeasonalQuestTitles() {
  const response = await wikiApiFetch({
    action: "query",
    list: "categorymembers",
    cmtitle: "Category:Seasonal quests",
    cmlimit: "500",
  });
  const members = response?.query?.categorymembers || [];
  return new Set(members.map((m) => m.title));
}
