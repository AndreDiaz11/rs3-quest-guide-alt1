import { wikiApiFetch } from "./wikiApi.js";

const BATCH_SIZE = 50; // MediaWiki's default max titles per query request

/**
 * Resolves wiki page titles (item/reward names) to their thumbnail image URL
 * via the PageImages API. Returns a Map<title, url|null>. Batches requests
 * since a quest can reference dozens of items/rewards.
 */
export async function resolveImages(titles) {
  const uniqueTitles = [...new Set(titles.filter(Boolean))];
  const results = new Map();

  for (let i = 0; i < uniqueTitles.length; i += BATCH_SIZE) {
    const batch = uniqueTitles.slice(i, i + BATCH_SIZE);
    const response = await wikiApiFetch({
      action: "query",
      titles: batch.join("|"),
      prop: "pageimages",
      pithumbsize: "100",
    });

    const pages = response?.query?.pages || {};
    for (const page of Object.values(pages)) {
      const url = page.thumbnail?.source || null;
      if (page.title) results.set(page.title, url);
    }
  }

  // Titles that didn't resolve to a page at all still get an explicit null.
  for (const title of uniqueTitles) {
    if (!results.has(title)) results.set(title, null);
  }

  return results;
}

/**
 * Resolves `File:` page names (e.g. from a standalone `[[File:X.png|thumb|...]]`
 * solution image, not the PageImages-based item/reward icons above) to their
 * actual full-size image URL via the ImageInfo API. Returns a
 * Map<filename, url|null>, keyed by the plain filename (no "File:" prefix).
 */
export async function resolveFileUrls(filenames) {
  const uniqueNames = [...new Set(filenames.filter(Boolean))];
  const results = new Map();

  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + BATCH_SIZE);
    const response = await wikiApiFetch({
      action: "query",
      titles: batch.map((name) => `File:${name}`).join("|"),
      prop: "imageinfo",
      iiprop: "url",
    });

    const pages = response?.query?.pages || {};
    for (const page of Object.values(pages)) {
      const url = page.imageinfo?.[0]?.url || null;
      const name = page.title?.replace(/^File:/, "");
      if (name) results.set(name, url);
    }

    // MediaWiki normalizes underscores to spaces (and similar canonicalization)
    // before matching a title — the response's own "normalized" list maps the
    // exact string requested ("from") to the canonical title MediaWiki actually
    // matched ("to"). Without this, a filename that arrives with underscores
    // (e.g. copied straight from a `[[File:Name_with_underscores.png]]` link)
    // only ever gets set under the SPACED title above, so the original
    // underscored name falls through to the "not found -> null" pass below and
    // silently overwrites what would have been a correct resolution.
    for (const { from, to } of response?.query?.normalized || []) {
      const toName = to?.replace(/^File:/, "");
      const fromName = from?.replace(/^File:/, "");
      if (fromName && toName && results.has(toName)) results.set(fromName, results.get(toName));
    }
  }

  for (const name of uniqueNames) {
    if (!results.has(name)) results.set(name, null);
  }

  return results;
}
