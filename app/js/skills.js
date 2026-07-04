// Orden de IDs de habilidad de RuneMetrics, verificado empíricamente cruzando
// contra el hiscores oficial de RS3 (por rank/xp) — RuneMetrics no publica esta
// tabla, así que quedó documentado acá con la fuente de la verificación.
const SKILL_NAMES_BY_ID = [
  "Attack",
  "Defence",
  "Strength",
  "Constitution",
  "Ranged",
  "Prayer",
  "Magic",
  "Cooking",
  "Woodcutting",
  "Fletching",
  "Fishing",
  "Firemaking",
  "Crafting",
  "Smithing",
  "Mining",
  "Herblore",
  "Agility",
  "Thieving",
  "Slayer",
  "Farming",
  "Runecrafting",
  "Hunter",
  "Construction",
  "Summoning",
  "Dungeoneering",
  "Divination",
  "Invention",
  "Archaeology",
  "Necromancy",
];

const PROXY_BASE = "https://rs3-runemetrics-proxy.rs3questguide.workers.dev";

/**
 * Fetches the player's skill levels + combat level from RuneMetrics (via our
 * CORS proxy). Returns { levelsBySkill: Map<string, number>, combatLevel } or
 * null if the profile couldn't be read (private/invalid name/network error).
 */
export async function fetchPlayerLevels(username) {
  if (!username || !username.trim()) return null;

  const url = `${PROXY_BASE}?user=${encodeURIComponent(username.trim())}&type=profile`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RuneMetrics (perfil) respondió con error (${res.status})`);
  const json = await res.json();

  if (json.error || !Array.isArray(json.skillvalues)) return null;

  const levelsBySkill = new Map();
  for (const entry of json.skillvalues) {
    const name = SKILL_NAMES_BY_ID[entry.id];
    if (name) levelsBySkill.set(name, entry.level);
  }

  return { levelsBySkill, combatLevel: json.combatlevel ?? null };
}
