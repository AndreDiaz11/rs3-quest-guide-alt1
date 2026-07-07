import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const API_BASE = "https://runescape.wiki/api.php";
const CACHE_DIR = fileURLToPath(new URL("../cache/api/", import.meta.url));
const USER_AGENT = "rs3-quest-guide-alt1-scraper/0.1 (developer-run offline dataset builder)";

let lastRequestAt = 0;
const MIN_DELAY_MS = 300;

function cacheKeyFor(params) {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(sorted).digest("hex");
}

async function politeDelay() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

/**
 * Calls the MediaWiki API at runescape.wiki, caching raw JSON responses on disk
 * so re-running the scraper is incremental and polite to the wiki's API.
 */
export async function wikiApiFetch(params, { useCache = true } = {}) {
  const fullParams = { format: "json", ...params };
  const key = cacheKeyFor(fullParams);
  const cachePath = path.join(CACHE_DIR, `${key}.json`);

  if (useCache) {
    try {
      const cached = await readFile(cachePath, "utf8");
      return JSON.parse(cached);
    } catch {
      // not cached yet, fall through to fetch
    }
  }

  await politeDelay();
  const url = new URL(API_BASE);
  for (const [k, v] of Object.entries(fullParams)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Wiki API request failed (${res.status}): ${url}`);
  }
  const json = await res.json();

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(json), "utf8");

  return json;
}

/**
 * Fetches a `Template:X` page's raw wikitext, or null if it doesn't exist.
 * Used for expanding a bare `{{Some Quest solution}}` transclusion (a
 * per-quest puzzle-solution template, e.g. a Battlefish grid or a barrel
 * puzzle sequence) that our checklist parser can't otherwise see the
 * contents of — the calling site decides what to do with the wikitext (a
 * table, a list, plain text, etc.), this just fetches it.
 */
export async function fetchTemplateWikitext(templateName) {
  const json = await wikiApiFetch({ action: "parse", page: `Template:${templateName}`, prop: "wikitext" });
  if (json.error) return null;
  return json.parse.wikitext["*"];
}
