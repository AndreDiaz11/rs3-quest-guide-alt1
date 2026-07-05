import { extractAllTemplates, wikitextToPlain, splitIntoSections } from "./wikitext.js";

function parseChecklistBlock(checklistContent, rawSteps, section) {
  const lines = checklistContent.split("\n");
  for (const line of lines) {
    // `*:` (bullet immediately followed by a colon) is the wiki's own convention
    // for a non-actionable note attached to the previous step (e.g. "If done
    // correctly, you receive a wrinkly scroll.") — must be checked before the
    // generic bullet pattern below, since it also starts with one or more `*`.
    // Without this, notes were shown as their own checkable step with a stray
    // leading ":" left in the text.
    const noteMatch = line.match(/^(\*+):\s?(.*)$/);
    if (noteMatch) {
      const indent = noteMatch[1].length - 1;
      rawSteps.push({ indent, raw: noteMatch[2], section, isNote: true });
      continue;
    }
    const bulletMatch = line.match(/^(\*+)\s?(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length - 1;
      rawSteps.push({ indent, raw: bulletMatch[2], section });
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
 * just one. Each step is tagged with the wiki heading of the section it came
 * from (kept in English on purpose, see the no-new-translation-cost decision
 * in scraper/src/run.js) so the app can group steps under sub-headings like
 * the wiki does. Within a block, top-level `* ` lines are steps, `** ` lines
 * are sub-steps (indent 1). Lines that don't start with a bullet are
 * continuations of the previous step's wikitext (happens when an inline
 * template, e.g. {{Chat options|...}}, itself spans multiple lines).
 */
export function parseSteps(quickGuideWikitext) {
  const rawSteps = []; // { indent, raw, section }
  for (const { heading, content } of splitIntoSections(quickGuideWikitext)) {
    const blocks = extractAllTemplates(content, "Checklist");
    for (const block of blocks) parseChecklistBlock(block, rawSteps, heading);
  }

  if (rawSteps.length === 0) {
    throw new Error("No {{Checklist|...}} block found in Quick guide wikitext");
  }

  // A step can come out empty if its wikitext was just an unrecognized inline
  // template we strip (e.g. a fairy ring code icon) — an empty instruction is
  // useless to show anyway, and sending blank lines to the translator causes
  // it to drop them inconsistently, breaking the line-count alignment check.
  return rawSteps
    .map((step) => ({
      indent: step.indent,
      section: step.section,
      isNote: step.isNote,
      ...wikitextToPlain(step.raw),
    }))
    .filter((step) => step.text.trim() !== "")
    .map((step, index) => ({
      index,
      indent: step.indent,
      section: step.section,
      ...(step.isNote ? { isNote: true } : {}),
      text: { en: step.text },
      chatOptions: step.chatOptions,
    }));
}
