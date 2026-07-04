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
    prop: "wikitext",
  });

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

  if (mainWikitext.error || quickGuideWikitext.error || quickGuideHtml.error) {
    throw new Error(
      `Wiki API error for "${title}": ${JSON.stringify(
        mainWikitext.error || quickGuideWikitext.error || quickGuideHtml.error
      )}`
    );
  }

  return {
    title,
    mainWikitext: mainWikitext.parse.wikitext["*"],
    quickGuideWikitext: quickGuideWikitext.parse.wikitext["*"],
    quickGuideHtml: quickGuideHtml.parse.text["*"],
  };
}
