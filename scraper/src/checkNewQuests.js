import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchQuestList } from "./fetchQuestList.js";
import { fetchSeasonalQuestTitles } from "./fetchSeasonalList.js";
import { scrapeOne } from "./run.js";
import { titleToSlug } from "./slug.js";

const INDEX_PATH = fileURLToPath(new URL("../../data/index.json", import.meta.url));
const SUMMARY_PATH = fileURLToPath(new URL("../new-quests-summary.txt", import.meta.url));

/**
 * Weekly automated check (see .github/workflows/check-new-quests.yml): finds
 * quest pages on the wiki that aren't in our dataset yet, and scrapes them in
 * English only (skipTranslate — free, no Anthropic API usage). Never
 * translates or touches existing quests. The workflow opens a PR with
 * whatever this finds instead of pushing straight to main, so a real person
 * always reviews new content (and decides when to spend translation credits)
 * before it goes live.
 */
async function main() {
  const index = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  const knownIds = new Set(index.quests.map((q) => q.id));

  const allTitles = await fetchQuestList();
  const newTitles = allTitles.filter((title) => {
    const slug = titleToSlug(title.replace(/\/Quick guide$/, ""));
    return !knownIds.has(slug);
  });

  if (newTitles.length === 0) {
    console.log("[check-new-quests] No hay misiones nuevas.");
    await writeFile(SUMMARY_PATH, "");
    return;
  }

  console.log(`[check-new-quests] ${newTitles.length} misión(es) nueva(s) encontrada(s):`);
  newTitles.forEach((t) => console.log(`  - ${t}`));

  const seasonalTitles = await fetchSeasonalQuestTitles();
  const scraped = [];
  const failed = [];
  for (const title of newTitles) {
    try {
      await scrapeOne(title, { skipTranslate: true }, seasonalTitles);
      scraped.push(title);
    } catch (err) {
      console.error(`[skip] ${title}: ${err.message}`);
      failed.push({ title, error: err.message });
    }
  }

  const lines = [];
  if (scraped.length > 0) {
    lines.push(`Misiones nuevas scrapeadas en inglés (sin traducir todavía):`, ...scraped.map((t) => `- ${t}`), "");
  }
  if (failed.length > 0) {
    lines.push(`No se pudieron scrapear (revisar manualmente):`, ...failed.map((f) => `- ${f.title}: ${f.error}`));
  }
  await writeFile(SUMMARY_PATH, lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
