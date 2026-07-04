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
