import { wikiApiFetch } from "./wikiApi.js";

/**
 * Fetches everything the parsers need for one quest: the main article's
 * wikitext (for the Infobox Quest template) and the Quick guide page's
 * wikitext (for the Checklist steps) plus rendered HTML (for the
 * metadata/requirements/rewards tables, which come from Lua-invoked
 * templates that raw wikitext can't hand-parse reliably).
 */
export async function fetchQuestPage(title) {
  const mainWikitext = await wikiApiFetch({
    action: "parse",
    page: title,
    prop: "wikitext|categories",
  });
  if (mainWikitext.error) {
    throw new Error(`Wiki API error for "${title}": ${JSON.stringify(mainWikitext.error)}`);
  }

  const quickGuideTitle = `${title}/Quick guide`;
  const quickGuideWikitext = await wikiApiFetch({
    action: "parse",
    page: quickGuideTitle,
    prop: "wikitext",
  });
  const quickGuideHtml = await wikiApiFetch({
    action: "parse",
    page: quickGuideTitle,
    prop: "text",
  });

  // A handful of quests removed from the game entirely (e.g. Unstable
  // Foundations, deleted 2011) still have a real main article but their
  // Quick guide page no longer exists at all — treat that as "no walkthrough
  // exists" (same as a hub quest) instead of a hard failure, since the main
  // article alone still has everything needed for metadata/QP tracking.
  const quickGuideMissing = quickGuideWikitext.error?.code === "missingtitle";
  if (quickGuideWikitext.error && !quickGuideMissing) {
    throw new Error(`Wiki API error for "${quickGuideTitle}": ${JSON.stringify(quickGuideWikitext.error)}`);
  }
  if (quickGuideHtml.error && !quickGuideMissing) {
    throw new Error(`Wiki API error for "${quickGuideTitle}": ${JSON.stringify(quickGuideHtml.error)}`);
  }

  const categories = (mainWikitext.parse.categories || []).map((c) => c["*"]);

  return {
    title,
    mainWikitext: mainWikitext.parse.wikitext["*"],
    quickGuideWikitext: quickGuideMissing ? null : quickGuideWikitext.parse.wikitext["*"],
    quickGuideHtml: quickGuideMissing ? null : quickGuideHtml.parse.text["*"],
    categories,
  };
}
