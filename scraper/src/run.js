import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchQuestList } from "./fetchQuestList.js";
import { fetchQuestPage } from "./fetchQuestPage.js";
import { parseMetadata } from "./parseMetadata.js";
import { parseSteps } from "./parseSteps.js";
import { parseRewards } from "./parseRewards.js";
import { buildQuestRecord } from "./buildDataset.js";
import { titleToSlug } from "./slug.js";

const QUESTS_DIR = fileURLToPath(new URL("../../data/quests/", import.meta.url));

function parseArgs(argv) {
  const args = { skipTranslate: false, only: null, all: false, limit: null, force: false };
  for (const arg of argv) {
    if (arg === "--skip-translate") args.skipTranslate = true;
    else if (arg === "--all") args.all = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--only=")) args.only = arg.slice("--only=".length);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
  }
  return args;
}

/** True if this quest's JSON already exists on disk with a Spanish translation on every step. */
async function alreadyTranslated(title) {
  const slug = titleToSlug(title.replace(/\/Quick guide$/, ""));
  try {
    const raw = await readFile(path.join(QUESTS_DIR, `${slug}.json`), "utf8");
    const record = JSON.parse(raw);
    return record.steps.length > 0 && record.steps.every((s) => Boolean(s.text.es));
  } catch {
    return false;
  }
}

async function scrapeOne(title, { skipTranslate }) {
  const page = await fetchQuestPage(title);

  const metadata = parseMetadata(page);
  const steps = parseSteps(page.quickGuideWikitext);
  const rewardsData = parseRewards(page.quickGuideHtml);

  const isMiniquest = /\(miniquest\)$/i.test(title);

  const record = await buildQuestRecord({
    title,
    metadata,
    steps,
    rewardsData,
    isMiniquest,
    skipTranslate,
  });

  console.log(`[done] ${title} -> data/quests/${record.id}.json (${steps.length} pasos)`);
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.only) {
    console.log(`[scrape] ${args.only}`);
    await scrapeOne(args.only, args);
    return;
  }

  if (args.all) {
    const allTitles = await fetchQuestList();
    const titles = args.limit ? allTitles.slice(0, args.limit) : allTitles;
    console.log(`[scrape] ${titles.length} misiones encontradas (de ${allTitles.length} en Category:Quick guides)`);

    const failures = [];
    let alreadyDone = 0;
    for (const [i, title] of titles.entries()) {
      // Resuming a translation run should never re-spend money on quests that
      // already have a full Spanish translation on disk.
      if (!args.skipTranslate && !args.force && (await alreadyTranslated(title))) {
        alreadyDone++;
        continue;
      }
      console.log(`[scrape] (${i + 1}/${titles.length}) ${title}`);
      try {
        await scrapeOne(title, args);
      } catch (err) {
        console.error(`[skip] ${title}: ${err.message}`);
        failures.push({ title, error: err.message });
      }
    }
    if (alreadyDone > 0) {
      console.log(`[scrape] ${alreadyDone} misiones ya traducidas se omitieron (usa --force para re-traducirlas).`);
    }

    console.log(`\n[resumen] ${titles.length - failures.length}/${titles.length} correctas.`);
    if (failures.length > 0) {
      console.log(`[resumen] Fallos (revisar manualmente):`);
      failures.forEach((f) => console.log(`  - ${f.title}: ${f.error}`));
    }
    return;
  }

  console.error(
    'Usage: node src/run.js --only="Quest Title" [--skip-translate]  |  --all [--limit=N] [--skip-translate]'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
