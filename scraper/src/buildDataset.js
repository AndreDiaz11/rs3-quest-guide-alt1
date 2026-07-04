import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { titleToSlug } from "./slug.js";
import { resolveImages } from "./resolveImages.js";
import { translateStrings } from "./translate.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const QUESTS_DIR = path.join(DATA_DIR, "quests");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

async function readIndex() {
  try {
    const raw = await readFile(INDEX_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { datasetVersion: null, lastUpdated: null, quests: [] };
  }
}

async function maybeTranslate(strings, skipTranslate) {
  if (skipTranslate || strings.length === 0) return strings.map(() => null);
  return translateStrings(strings);
}

/**
 * Assembles the final per-quest JSON (schema per the implementation plan) and
 * upserts its summary into data/index.json. Writes both to disk.
 */
export async function buildQuestRecord({
  title,
  metadata,
  steps,
  rewardsData,
  isMiniquest,
  isSeasonal,
  skipTranslate,
  guideNote,
}) {
  const id = titleToSlug(title);
  const now = new Date().toISOString();

  // Translate all step text + start point in one batch call (context stays together).
  const textsToTranslate = [metadata.startPoint || "", ...steps.map((s) => s.text.en)];
  const translated = await maybeTranslate(textsToTranslate, skipTranslate);
  const [startPointEs, ...stepEsTexts] = translated;

  const stepsWithEs = steps.map((step, i) => ({
    ...step,
    text: { en: step.text.en, ...(stepEsTexts[i] ? { es: stepEsTexts[i] } : {}) },
  }));

  // Resolve images for every item/reward name referenced by this quest.
  const itemNames = metadata.items.map((i) => i.name);
  const rewardNames = rewardsData.rewards.filter((r) => r.type === "item").map((r) => r.name);
  const imageMap = await resolveImages([...itemNames, ...rewardNames]);

  const items = metadata.items.map((i) => ({
    name: i.name,
    display: i.display,
    image: imageMap.get(i.name) || null,
  }));

  // Note: deliberately NOT falling back to the Infobox's |qp= field when a hub
  // quest's Quick guide has no Rewards section — verified against a real
  // account that doing so overshoots the game's actual Quest Points total
  // (Once Upon a Time in Gielinor's |qp=4 does not count towards the stat
  // shown in-game, even though RuneMetrics's API also reports it as 4).
  const rewards = rewardsData.rewards.map((r) => ({
    ...r,
    image: r.type === "item" ? imageMap.get(r.name) || null : null,
  }));

  const record = {
    id,
    title,
    isMiniquest,
    isSeasonal: Boolean(isSeasonal),
    guideLastUpdated: now,
    icon: metadata.icon,
    series: metadata.series,
    age: metadata.age,
    timeline: metadata.timeline,
    members: metadata.members,
    combatLevel: metadata.combatLevel,
    difficulty: metadata.difficulty,
    length: metadata.length,
    releaseDate: metadata.release,
    startPoint: { en: metadata.startPoint, ...(startPointEs ? { es: startPointEs } : {}) },
    requirements: metadata.requirements,
    items,
    kills: metadata.kills,
    rewards,
    postQuest: rewardsData.postQuest,
    steps: stepsWithEs,
    ...(guideNote ? { guideNote } : {}),
  };

  await mkdir(QUESTS_DIR, { recursive: true });
  await writeFile(path.join(QUESTS_DIR, `${id}.json`), JSON.stringify(record, null, 2), "utf8");

  const index = await readIndex();
  const questPoints = rewards.find((r) => r.type === "questPoints")?.amount || 0;
  const summary = {
    id,
    title,
    isMiniquest,
    isSeasonal: Boolean(isSeasonal),
    members: metadata.members,
    combatLevel: metadata.combatLevel,
    length: metadata.length,
    series: metadata.series,
    age: metadata.age,
    timeline: metadata.timeline,
    releaseDate: metadata.release,
    startLocation: metadata.area,
    questPoints,
  };
  const existingIndex = index.quests.findIndex((q) => q.id === id);
  if (existingIndex >= 0) index.quests[existingIndex] = summary;
  else index.quests.push(summary);
  index.lastUpdated = now;
  index.datasetVersion = now.slice(0, 10);

  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");

  return record;
}
