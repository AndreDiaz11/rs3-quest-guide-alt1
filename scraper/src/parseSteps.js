import { extractAllTemplates, wikitextToPlain } from "./wikitext.js";

function parseChecklistBlock(checklistContent, rawSteps) {
  const lines = checklistContent.split("\n");
  for (const line of lines) {
    const bulletMatch = line.match(/^(\*+)\s?(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length - 1;
      rawSteps.push({ indent, raw: bulletMatch[2] });
    } else if (rawSteps.length > 0 && line.trim() !== "") {
      // continuation of the previous step's still-open inline template
      rawSteps[rawSteps.length - 1].raw += "\n" + line;
    }
  }
}

/**
 * Parses every {{Checklist|...}} block from a Quick guide page's wikitext
 * into a single ordered array of steps. Longer quests split their walkthrough
 * across multiple `==Heading==` sections, each with its own Checklist block
 * (e.g. A Christmas Reunion has three); shorter ones like Hermit Permits have
 * just one. Within a block, top-level `* ` lines are steps, `** ` lines are
 * sub-steps (indent 1). Lines that don't start with a bullet are continuations
 * of the previous step's wikitext (happens when an inline template, e.g.
 * {{Chat options|...}}, itself spans multiple lines).
 */
export function parseSteps(quickGuideWikitext) {
  const blocks = extractAllTemplates(quickGuideWikitext, "Checklist");
  if (blocks.length === 0) {
    throw new Error("No {{Checklist|...}} block found in Quick guide wikitext");
  }

  const rawSteps = []; // { indent, raw }
  for (const block of blocks) parseChecklistBlock(block, rawSteps);

  return rawSteps.map((step, index) => ({
    index,
    indent: step.indent,
    text: { en: wikitextToPlain(step.raw) },
  }));
}
