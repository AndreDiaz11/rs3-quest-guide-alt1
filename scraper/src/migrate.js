import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchQuestPage } from "./fetchQuestPage.js";
import { parseMetadata } from "./parseMetadata.js";
import { parseSteps } from "./parseSteps.js";
import { parseRewards } from "./parseRewards.js";
import { buildQuestRecord } from "./buildDataset.js";

const QUESTS_DIR = fileURLToPath(new URL("../../data/quests/", import.meta.url));

/**
 * Re-scrapes every quest already on disk with the new structure (per-step
 * `section` heading, `chatOptions` split out of the narrative text) WITHOUT
 * spending any new Anthropic credits: it re-runs the free wiki scraping
 * (fetchQuestPage/parseMetadata/parseSteps/parseRewards/resolveImages), then
 * reuses each step's EXISTING Spanish translation from disk (matched by
 * index — step count/order doesn't change).
 *
 * Usage: node src/migrate.js [--only=slug] [--limit=N]
 */

function parseArgs(argv) {
  const args = { only: null, limit: null };
  for (const arg of argv) {
    if (arg.startsWith("--only=")) args.only = arg.slice("--only=".length);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
  }
  return args;
}

async function migrateOne(slug) {
  const oldRaw = await readFile(path.join(QUESTS_DIR, `${slug}.json`), "utf8");
  const old = JSON.parse(oldRaw);

  const page = await fetchQuestPage(old.title);
  const metadata = parseMetadata(page);
  const rewardsData = page.quickGuideHtml ? parseRewards(page.quickGuideHtml) : { rewards: [], postQuest: [] };
  let steps;
  if (page.quickGuideWikitext === null) {
    // Removed-from-the-game quest (e.g. Unstable Foundations) — its Quick
    // guide page doesn't exist at all, so there's no walkthrough to parse.
    steps = [];
  } else {
    try {
      steps = await parseSteps(page.quickGuideWikitext);
    } catch (err) {
      if (!err.message.includes("No {{Checklist") || !old.guideNote) {
        console.error(`[error] ${slug}: ${err.message}`);
        return;
      }
      // Hub quest (e.g. Recipe for Disaster) — no walkthrough of its own, but its
      // metadata (requirements, rewards, etc.) still needs to stay up to date.
      steps = [];
    }
  }

  // Build fresh (English-only, skipTranslate) so no AI credits are spent.
  const record = await buildQuestRecord({
    title: old.title,
    metadata,
    steps,
    rewardsData,
    isMiniquest: old.isMiniquest,
    isSeasonal: old.isSeasonal,
    skipTranslate: true,
    guideNote: old.guideNote,
  });

  // Overlay the existing Spanish translations, matched by index among plain
  // text steps only — table/image steps are English-only kinds (like
  // item/reward names) that can appear mid-guide and would otherwise shift
  // every subsequent step's index, silently desyncing the reused translations
  // for the rest of the quest.
  // `old.steps` may itself already contain table/image steps from a previous
  // run of this same script — filter them out before comparing/matching, or
  // the index-based overlay below silently shifts and misassigns translations.
  const isStructural = (s) => Boolean(s.isTable || s.isImage || s.isSelectableList || s.isSectionNote || s.isImageGroup);
  const oldTextSteps = (old.steps || []).filter((s) => !isStructural(s));
  const textStepCount = steps.filter((s) => !isStructural(s)).length;
  if (textStepCount !== oldTextSteps.length) {
    console.warn(
      `[warn] ${slug}: el número de pasos cambió (${oldTextSteps.length} -> ${textStepCount}); ` +
        `se reutiliza traducción solo hasta el índice más corto, revisar manualmente.`
    );
  }
  let oldIndex = 0;
  record.steps = record.steps.map((step) => {
    if (isStructural(step)) return step;
    const oldEs = oldTextSteps[oldIndex]?.text?.es;
    oldIndex++;
    return oldEs ? { ...step, text: { ...step.text, es: oldEs } } : step;
  });
  if (old.startPoint?.es) {
    record.startPoint = { ...record.startPoint, es: old.startPoint.es };
  }

  // Selectable-list items (e.g. The Mighty Fall's "talk to the following
  // goblins" widget) carry their own translatable text — reuse by matching
  // the Nth selectable-list block to the Nth one in the old file, then by
  // item index within it, same spirit as the main step overlay above.
  const oldSelectableLists = (old.steps || []).filter((s) => s.isSelectableList);
  let selectableListIndex = 0;
  record.steps = record.steps.map((step) => {
    if (!step.isSelectableList) return step;
    const oldList = oldSelectableLists[selectableListIndex];
    selectableListIndex++;
    if (!oldList) return step;
    return {
      ...step,
      items: step.items.map((item, i) => {
        const oldEs = oldList.items?.[i]?.text?.es;
        return oldEs ? { ...item, text: { ...item.text, es: oldEs } } : item;
      }),
    };
  });

  // Section notes ({{Needed|...}}) carry their own translatable text, same
  // Nth-block matching approach as the selectable lists above.
  const oldSectionNotes = (old.steps || []).filter((s) => s.isSectionNote);
  let sectionNoteIndex = 0;
  record.steps = record.steps.map((step) => {
    if (!step.isSectionNote) return step;
    const oldNote = oldSectionNotes[sectionNoteIndex];
    sectionNoteIndex++;
    if (!oldNote) return step;
    const attach = (field) => {
      if (!step[field]) return undefined;
      const oldEs = oldNote[field]?.text?.es;
      return oldEs ? { ...step[field], text: { ...step[field].text, es: oldEs } } : step[field];
    };
    return {
      ...step,
      ...(step.needed ? { needed: attach("needed") } : {}),
      ...(step.recommended ? { recommended: attach("recommended") } : {}),
    };
  });

  await writeFile(path.join(QUESTS_DIR, `${slug}.json`), JSON.stringify(record, null, 2), "utf8");
  console.log(`[done] ${slug} migrado (${record.steps.length} pasos)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.only) {
    await migrateOne(args.only);
    return;
  }

  const files = (await readdir(QUESTS_DIR)).filter((f) => f.endsWith(".json"));
  const slugs = args.limit ? files.slice(0, args.limit) : files;
  console.log(`[migrate] ${slugs.length} misiones a migrar`);

  const failures = [];
  for (const [i, file] of slugs.entries()) {
    const slug = file.replace(/\.json$/, "");
    console.log(`[migrate] (${i + 1}/${slugs.length}) ${slug}`);
    try {
      await migrateOne(slug);
    } catch (err) {
      console.error(`[skip] ${slug}: ${err.message}`);
      failures.push({ slug, error: err.message });
    }
  }

  console.log(`\n[resumen] ${slugs.length - failures.length}/${slugs.length} correctas.`);
  if (failures.length > 0) {
    console.log(`[resumen] Fallos (revisar manualmente):`);
    failures.forEach((f) => console.log(`  - ${f.slug}: ${f.error}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
