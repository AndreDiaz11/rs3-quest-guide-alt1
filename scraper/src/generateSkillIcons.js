import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { wikiApiFetch } from "./wikiApi.js";

const OUT_PATH = fileURLToPath(new URL("../../app/data/skillIcons.json", import.meta.url));

const SKILLS = [
  "Attack", "Defence", "Strength", "Constitution", "Ranged", "Prayer", "Magic", "Cooking",
  "Woodcutting", "Fletching", "Fishing", "Firemaking", "Crafting", "Smithing", "Mining",
  "Herblore", "Agility", "Thieving", "Slayer", "Farming", "Runecrafting", "Hunter",
  "Construction", "Summoning", "Dungeoneering", "Divination", "Invention", "Archaeology", "Necromancy",
];

async function main() {
  const icons = {};
  for (const skill of SKILLS) {
    const res = await wikiApiFetch({ action: "query", titles: `File:${skill}-icon.png`, prop: "imageinfo", iiprop: "url" });
    const pages = res.query?.pages || {};
    const page = Object.values(pages)[0];
    const url = page?.imageinfo?.[0]?.url;
    if (url) {
      icons[skill] = url;
      console.log(`[ok] ${skill} -> ${url}`);
    } else {
      console.warn(`[missing] ${skill}`);
    }
  }
  await writeFile(OUT_PATH, JSON.stringify(icons, null, 2), "utf8");
  console.log(`Written ${Object.keys(icons).length} icons to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
