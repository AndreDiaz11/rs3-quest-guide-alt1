let icons = {};

/** Preloads the skill icon URL map once at startup; safe to call multiple times. */
export async function loadSkillIcons() {
  try {
    const res = await fetch("data/skillIcons.json");
    icons = await res.json();
  } catch {
    icons = {};
  }
}

/** Returns the wiki's icon URL for a skill name, or null if unknown/not loaded yet. */
export function getSkillIcon(skillName) {
  return icons[skillName] || null;
}
