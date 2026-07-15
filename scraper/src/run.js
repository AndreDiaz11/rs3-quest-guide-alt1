import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchQuestList } from "./fetchQuestList.js";
import { fetchSeasonalQuestTitles } from "./fetchSeasonalList.js";
import { fetchQuestPage } from "./fetchQuestPage.js";
import { parseMetadata, extractSubquestTitles } from "./parseMetadata.js";
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

// Table/image(-group) steps carry no `text` field of their own (nothing to
// translate); a selectable-list/section-note step's translatable text lives
// nested in `items`/`needed`/`recommended` instead of a top-level `text`.
// The naive `Boolean(s.text.es)` this replaced would throw on any of these
// (`s.text` is undefined), which alreadyTranslated()'s try/catch silently
// swallowed as "not translated yet" — silently re-translating (and
// re-billing) every quest that contains so much as one table or image,
// found while auditing before a real (non-free) translation run.
function stepIsFullyTranslated(step) {
  if (step.isTable || step.isImage || step.isImageGroup) return true;
  if (step.isSelectableList) return step.items.every((item) => Boolean(item.text?.es));
  if (step.isSectionNote) {
    return (!step.needed || Boolean(step.needed.text?.es)) && (!step.recommended || Boolean(step.recommended.text?.es));
  }
  return Boolean(step.text?.es);
}

/** True if this quest's JSON already exists on disk with a Spanish translation on every step AND its start point. */
async function alreadyTranslated(title) {
  const slug = titleToSlug(title.replace(/\/Quick guide$/, ""));
  try {
    const raw = await readFile(path.join(QUESTS_DIR, `${slug}.json`), "utf8");
    const record = JSON.parse(raw);
    const startPointOk = !record.startPoint?.en || Boolean(record.startPoint?.es);
    return startPointOk && record.steps.length > 0 && record.steps.every(stepIsFullyTranslated);
  } catch {
    return false;
  }
}

export const HUB_QUEST_NOTE = {
  en: "This quest is a hub for several sub-quests. There isn't a single walkthrough for the hub itself, but each sub-quest's full guide is below in its own section — tap one to expand it.",
  es: "Esta misión es un resumen que agrupa varias sub-misiones. No existe una guía única para la misión en sí, pero la guía completa de cada sub-misión está más abajo en su propia sección — tocá una para desplegarla.",
};

// Shown for a brand-new quest whose own wiki page exists but whose Quick
// guide hasn't been written yet (the wiki community usually adds one within
// hours/days of release) — distinct from HUB_QUEST_NOTE (permanent, no
// walkthrough by design) and from a removed quest's `removedDate` banner.
// `isPending` (see buildQuestRecord) flags these for automatic retry by
// checkNewQuests.js until the real walkthrough shows up.
export const PENDING_GUIDE_NOTE = {
  en: "This quest was just released and the wiki's step-by-step guide isn't available yet. It'll fill in here automatically once it's added.",
  es: "Esta misión acaba de salir y la wiki todavía no tiene la guía paso a paso. Se completará acá automáticamente en cuanto esté disponible.",
};

// Deleted-content quests are excluded by default (see isNonPlayableContent
// below) since most are old pre-rework leftovers with no real QP of their
// own. Unstable Foundations is the one deliberate exception: RuneScape's own
// Quest Points total (confirmed against a real account) still counts its 1
// QP even though the quest was removed in 2011 and can never be played or
// completed again — so it stays in the dataset, just flagged via
// `removedDate` and shown with a "no longer available" banner in the app.
const PRESERVED_REMOVED_QUESTS = new Set(["Unstable Foundations"]);

// Fremennik Sagas ("Nadir (saga)", etc.) are 0 QP and RS3's own quest journal
// filters them under "Show Miniquests" (confirmed against a real account's
// filter panel — they never show up under "Show Quests"), so they count as
// miniquests here too, same as the "(miniquest)" suffix. Exported so
// migrate.js can recompute this fresh on every migrate run instead of
// blindly carrying over whatever was on disk (which is exactly how the
// sagas ended up permanently misclassified after the initial scrape).
export function isMiniquestTitle(title) {
  return /\((miniquest|saga)\)$/i.test(title);
}

/**
 * Belt-and-suspenders: some event quests are only tagged with a
 * year-specific category (e.g. "2019_Easter_event") rather than the general
 * Category:Seasonal quests, so check both the master list and this page's
 * own categories. Matched narrowly (singular "_event" or exact
 * "Holiday_events"/"Seasonal_quests") to avoid false positives like
 * "Repeatable_events" or "Wilderness_Flash_Events", which are unrelated game
 * features that happen to contain the word "event". Exported so migrate.js
 * can recompute this fresh instead of blindly carrying over whatever was on
 * disk (the same stale-copy bug fixed for isMiniquestTitle above).
 */
export function isSeasonalQuest(title, categories, seasonalTitles) {
  return (
    seasonalTitles.has(title) || (categories || []).some((c) => /^seasonal_quests$|^holiday_events$|_event$/i.test(c))
  );
}

/**
 * True for wiki pages that aren't a real, currently-playable quest: the old
 * pre-rework version of a quest that already has its own current page
 * ("X (historical)"), content removed from the game entirely
 * ({{Deleted content}}/{{Quest reworked}}), or a seasonal-event overview page
 * ({{Infobox Event}}) rather than the actual quest/miniquest infobox our
 * parser expects. Found via the automated new-quest checker picking up wiki
 * pages that exist in Category:Quick guides but aren't meant to be scraped.
 */
function isNonPlayableContent(title, mainWikitext) {
  if (PRESERVED_REMOVED_QUESTS.has(title)) return false;
  return (
    /\(historical\)$/i.test(title) ||
    /\{\{Deleted content\}\}|\{\{Quest reworked/i.test(mainWikitext) ||
    /\{\{Infobox Event/i.test(mainWikitext) ||
    // {{Nonexistence|scrapped=yes}} marks a quest that was planned/developed
    // but never actually released (e.g. "Hunter Skillcape Quest", "Tome
    // Raider (quest)") — found via Category:Quests, which lists these
    // alongside real quests since the wiki still documents cancelled ones.
    /\{\{Nonexistence\|[^}]*scrapped\s*=\s*yes/i.test(mainWikitext)
  );
}

export async function scrapeOne(title, { skipTranslate }, seasonalTitles) {
  const page = await fetchQuestPage(title);

  if (isNonPlayableContent(title, page.mainWikitext)) {
    throw new Error("Contenido histórico/eliminado del juego, no una misión jugable actual — excluida a propósito.");
  }

  const metadata = parseMetadata(page);
  const rewardsData = page.quickGuideHtml ? parseRewards(page.quickGuideHtml) : { rewards: [], postQuest: [] };
  const isMiniquest = isMiniquestTitle(title);
  const isSeasonal = isSeasonalQuest(title, page.categories, seasonalTitles);

  let steps;
  let guideNote;
  let isPending = false;
  if (page.quickGuideWikitext === null) {
    // No Quick guide page exists at all — either a removed-from-the-game
    // quest (e.g. Unstable Foundations, flagged via metadata.removedDate,
    // already gets its own "no longer available" banner) or a brand-new
    // quest whose walkthrough the wiki hasn't written yet.
    steps = [];
    if (!metadata.removedDate) {
      guideNote = PENDING_GUIDE_NOTE;
      isPending = true;
    }
  } else {
    try {
      steps = await parseSteps(page.quickGuideWikitext);
    } catch (err) {
      if (!err.message.includes("No {{Checklist")) throw err;
      // "Hub" quests (e.g. Recipe for Disaster) group several sub-quests instead of
      // having their own step-by-step Checklist. Still worth including for their
      // quest points/completion tracking, just without a walkthrough of their own.
      steps = [];
      guideNote = HUB_QUEST_NOTE;
    }
  }

  const record = await buildQuestRecord({
    title,
    metadata,
    steps,
    rewardsData,
    isMiniquest,
    isSeasonal,
    skipTranslate,
    guideNote,
    isPending,
    ...extractSubquestTitles(page),
  });

  console.log(`[done] ${title} -> data/quests/${record.id}.json (${steps.length} pasos)`);
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seasonalTitles = await fetchSeasonalQuestTitles();

  if (args.only) {
    console.log(`[scrape] ${args.only}`);
    await scrapeOne(args.only, args, seasonalTitles);
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
        await scrapeOne(title, args, seasonalTitles);
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

// Only run the CLI when this file is executed directly (`node src/run.js`),
// not when another script imports `scrapeOne` from it (e.g. checkNewQuests.js)
// — importing used to trigger this immediately with no CLI args and exit(1).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
