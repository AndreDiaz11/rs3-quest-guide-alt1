import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { titleToSlug } from "./slug.js";
import { resolveImages, resolveFileUrls } from "./resolveImages.js";
import { translateStrings } from "./translate.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const QUESTS_DIR = path.join(DATA_DIR, "quests");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

// XP-reward icons (e.g. the Smithing hammer next to "10,000 experience") reuse
// this same map the requirements section already uses — must be resolved
// here in the permanent build pipeline, not as a one-off patch script, or the
// next full migrate.js run silently wipes them again (this happened once).
const skillIconsPath = fileURLToPath(new URL("../../app/data/skillIcons.json", import.meta.url));
const skillIcons = JSON.parse(await readFile(skillIconsPath, "utf8"));
const skillIconsLower = new Map(Object.entries(skillIcons).map(([k, v]) => [k.toLowerCase(), v]));

// Quest points the wiki's own Rewards section gets wrong for these two hub
// quests, verified against a real account (and cross-checked against
// RunePixels) — must survive every re-scrape/migration, not just be patched
// once on disk, or a future `migrate.js --all` silently reverts them (this
// happened once already).
const QP_OVERRIDES = {
  // The wiki lists the SUM of all 10 Recipe for Disaster sub-quests (10) as
  // this hub's own reward, but RuneMetrics reports 0 for the hub itself —
  // each sub-quest already counts its own points separately.
  "recipe-for-disaster": 0,
  // This hub has no Rewards section of its own on the wiki (0 scraped), but
  // RuneMetrics reports 4 QP for it specifically.
  "once-upon-a-time-in-gielinor": 4,
  // Removed from the game in 2011 ({{Deleted content}}, no Quick guide page
  // left to scrape a Rewards section from) — but RuneScape's own Quest
  // Points total still counts its 1 QP, confirmed against a real account.
  "unstable-foundations": 1,
};

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
  subquests,
}) {
  const id = titleToSlug(title);
  const now = new Date().toISOString();

  // Translate all step text + start point + every selectable-list item's own
  // text in one batch call (context stays together). Empty strings (e.g. a
  // quest with no scraped start point) are skipped before sending — an empty
  // line in the batch gets silently dropped by the model, which desyncs
  // every line after it and makes the length check fail forever.
  const selectableItemRefs = [];
  steps.forEach((step, stepIndex) => {
    if (step.isSelectableList) {
      step.items.forEach((item, itemIndex) => selectableItemRefs.push({ stepIndex, itemIndex, text: item.text.en }));
    }
  });
  // {{Needed|...}}/{{Needed|recommended=...}} section notes carry their own
  // one or two lines of translatable text, same batching pattern as the
  // selectable-list items above.
  const sectionNoteRefs = [];
  steps.forEach((step, stepIndex) => {
    if (!step.isSectionNote) return;
    if (step.needed) sectionNoteRefs.push({ stepIndex, field: "needed", text: step.needed.text });
    if (step.recommended) sectionNoteRefs.push({ stepIndex, field: "recommended", text: step.recommended.text });
  });
  const allTexts = [
    metadata.startPoint || "",
    ...steps.map((s) => (s.isTable || s.isImage || s.isImageGroup || s.isSelectableList || s.isSectionNote ? "" : s.text.en)),
    ...selectableItemRefs.map((ref) => ref.text),
    ...sectionNoteRefs.map((ref) => ref.text),
  ];
  const nonEmptyIndexes = [];
  const nonEmptyTexts = [];
  allTexts.forEach((text, i) => {
    if (text.trim() !== "") {
      nonEmptyIndexes.push(i);
      nonEmptyTexts.push(text);
    }
  });
  const translatedNonEmpty = await maybeTranslate(nonEmptyTexts, skipTranslate);
  const translated = new Array(allTexts.length).fill(null);
  nonEmptyIndexes.forEach((originalIndex, i) => {
    translated[originalIndex] = translatedNonEmpty[i];
  });
  const [startPointEs, ...rest] = translated;
  const stepEsTexts = rest.slice(0, steps.length);
  const selectableItemEsTexts = rest.slice(steps.length, steps.length + selectableItemRefs.length);
  const sectionNoteEsTexts = rest.slice(steps.length + selectableItemRefs.length);

  // Table/image/selectable-list/section-note steps' own top-level text field
  // is skipped here (translated individually just below instead).
  const stepsWithEs = steps.map((step, i) => {
    if (step.isTable || step.isImage || step.isImageGroup) return step;
    if (step.isSelectableList || step.isSectionNote) return step;
    return { ...step, text: { en: step.text.en, ...(stepEsTexts[i] ? { es: stepEsTexts[i] } : {}) } };
  });
  const stepsWithSelectableEs = stepsWithEs.map((step, stepIndex) => {
    if (!step.isSelectableList) return step;
    const items = step.items.map((item, itemIndex) => {
      const ref = selectableItemRefs.findIndex((r) => r.stepIndex === stepIndex && r.itemIndex === itemIndex);
      const es = selectableItemEsTexts[ref];
      return { ...item, text: { en: item.text.en, ...(es ? { es } : {}) } };
    });
    return { ...step, items };
  });
  const stepsWithSectionNoteEs = stepsWithSelectableEs.map((step, stepIndex) => {
    if (!step.isSectionNote) return step;
    const attach = (field) => {
      if (!step[field]) return undefined;
      const ref = sectionNoteRefs.findIndex((r) => r.stepIndex === stepIndex && r.field === field);
      const es = sectionNoteEsTexts[ref];
      return { ...step[field], text: { en: step[field].text, ...(es ? { es } : {}) } };
    };
    return {
      ...step,
      ...(step.needed ? { needed: attach("needed") } : {}),
      ...(step.recommended ? { recommended: attach("recommended") } : {}),
    };
  });

  // Resolve every standalone solution-image filename, plus every small inline
  // icon referenced within a step's own sentence (e.g. a mining-spot icon
  // right before a place name) or a selectable-list item's, to their real
  // URLs in one batch.
  const imageStepFilenames = [
    ...steps.filter((s) => s.isImage).map((s) => s.filename),
    ...steps.filter((s) => s.isImageGroup).flatMap((s) => s.images.map((im) => im.filename)),
  ];
  const inlineIconFilenames = [
    ...steps.flatMap((s) => s.iconFilenames || []),
    ...selectableItemRefs.flatMap((ref) => steps[ref.stepIndex].items[ref.itemIndex].iconFilenames || []),
  ];
  const fileUrlMap = await resolveFileUrls([...imageStepFilenames, ...inlineIconFilenames]);
  const attachIcons = (entity) => {
    if (!entity.iconFilenames?.length) return entity;
    const { iconFilenames, ...rest } = entity;
    return { ...rest, icons: iconFilenames.map((f) => ({ filename: f, image: fileUrlMap.get(f) || null })) };
  };
  const stepsWithImages = stepsWithSectionNoteEs.map((step) => {
    if (step.isImage) return { ...step, image: fileUrlMap.get(step.filename) || null };
    if (step.isImageGroup) {
      return { ...step, images: step.images.map((im) => ({ ...im, image: fileUrlMap.get(im.filename) || null })) };
    }
    if (step.isSelectableList) return { ...step, items: step.items.map(attachIcons) };
    if (step.isSectionNote) return step;
    return attachIcons(step);
  });

  // Required/recommended items can nest (e.g. The Elder Kiln's "Melee, magic
  // or ranged armour..." with 3 indented caveats underneath) — flatten the
  // whole tree to collect every name for the image batch, then walk it again
  // to attach each resolved image while keeping the tree shape intact. A
  // node's name is checked against the skill-icon map first (e.g.
  // Recommended's "Combat level"), same free reuse as xp-reward icons below.
  function flattenItemNames(nodes) {
    return nodes.flatMap((n) => [n.name, ...(n.children ? flattenItemNames(n.children) : [])]);
  }
  function attachItemImages(nodes) {
    return nodes.map((n) => ({
      name: n.name,
      display: n.display,
      image: skillIconsLower.get(n.name.toLowerCase()) || imageMap.get(n.name) || null,
      ...(n.children ? { children: attachItemImages(n.children) } : {}),
    }));
  }

  // Resolve images for every item/reward name referenced by this quest, plus
  // any xp-reward "skill" that isn't a real skill (lamps, one-off items —
  // e.g. "Mysterious lamp" — misclassified as type "xp" during scraping,
  // same as real skills like "Smithing" which get their icon for free below).
  const itemNames = flattenItemNames(metadata.items);
  const recommendedNames = flattenItemNames(metadata.recommended);
  const rewardNames = rewardsData.rewards.filter((r) => r.type === "item").map((r) => r.name);
  const xpNonSkillNames = rewardsData.rewards
    .filter((r) => r.type === "xp" && r.skill && !skillIconsLower.has(r.skill.toLowerCase()))
    .map((r) => r.skill);
  const imageMap = await resolveImages([...itemNames, ...recommendedNames, ...rewardNames, ...xpNonSkillNames]);

  const items = attachItemImages(metadata.items);
  const recommended = attachItemImages(metadata.recommended);

  // A second, separate icon from the main quest image — only some quests have one.
  const entityIcon = metadata.entityIconFilename
    ? (await resolveFileUrls([metadata.entityIconFilename])).get(metadata.entityIconFilename) || null
    : null;

  // Note: deliberately NOT falling back to the Infobox's |qp= field when a hub
  // quest's Quick guide has no Rewards section — verified against a real
  // account that doing so overshoots the game's actual Quest Points total
  // (Once Upon a Time in Gielinor's |qp=4 does not count towards the stat
  // shown in-game, even though RuneMetrics's API also reports it as 4).
  const rewards = rewardsData.rewards.map((r) => {
    if (r.type === "item") return { ...r, image: imageMap.get(r.name) || null };
    if (r.type === "xp" && r.skill) {
      const skillIcon = skillIconsLower.get(r.skill.toLowerCase());
      return { ...r, image: skillIcon || imageMap.get(r.skill) || null };
    }
    return { ...r, image: null };
  });

  const record = {
    id,
    title,
    isMiniquest,
    isSeasonal: Boolean(isSeasonal),
    guideLastUpdated: now,
    icon: metadata.icon,
    entityIcon,
    series: metadata.series,
    seriesNth: metadata.seriesNth,
    age: metadata.age,
    timeline: metadata.timeline,
    members: metadata.members,
    voiceOver: metadata.voiceOver,
    combatLevel: metadata.combatLevel,
    difficulty: metadata.difficulty,
    length: metadata.length,
    releaseDate: metadata.release,
    area: metadata.area,
    startPoint: { en: metadata.startPoint, ...(startPointEs ? { es: startPointEs } : {}) },
    requirements: metadata.requirements,
    followsEvents: metadata.followsEvents,
    items,
    recommended,
    kills: metadata.kills,
    rewards,
    rewardBannerImage: rewardsData.rewardBannerImage || null,
    postQuest: rewardsData.postQuest,
    steps: stepsWithImages,
    ...(guideNote ? { guideNote } : {}),
    ...(metadata.removedDate ? { removedDate: metadata.removedDate } : {}),
    ...(subquests?.length ? { subquests } : {}),
  };

  await mkdir(QUESTS_DIR, { recursive: true });
  await writeFile(path.join(QUESTS_DIR, `${id}.json`), JSON.stringify(record, null, 2), "utf8");

  const index = await readIndex();
  const questPoints = QP_OVERRIDES[id] ?? (rewards.find((r) => r.type === "questPoints")?.amount || 0);
  const summary = {
    id,
    title,
    isMiniquest,
    isSeasonal: Boolean(isSeasonal),
    members: metadata.members,
    length: metadata.length,
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
