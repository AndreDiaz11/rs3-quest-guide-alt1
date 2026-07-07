import { extractAllTemplatesWithPositions, wikitextToPlain, splitIntoSections } from "./wikitext.js";
import { extractWikiTables, parseWikiTableToStructured, extractSolutionImages, parseFileParams } from "./parseTables.js";

function parseChecklistBlock(checklistContent, rawSteps, section) {
  const lines = checklistContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    // `*:` (bullet immediately followed by a colon) is the wiki's own convention
    // for a non-actionable note attached to the previous step (e.g. "If done
    // correctly, you receive a wrinkly scroll.") — must be checked before the
    // generic bullet pattern below, since it also starts with one or more `*`.
    const noteMatch = trimmed.match(/^(\*+):\s?(.*)$/);

    // A standalone solution/reference image (e.g. The Elder Kiln's "Tzhaar
    // numbers" figure, or King of the Dwarves' key-combination figure, which
    // sits inside a "*:" note line instead of its own bare line) can appear
    // directly inside a Checklist block, before or between bullets — must be
    // pulled out as its own step in place, or it gets swallowed as stray
    // "continuation" text (glued onto whichever step happens to be adjacent)
    // or as an empty, filtered-out note once its icon markup is stripped.
    const candidateImageText = noteMatch ? noteMatch[2] : trimmed;
    const imgMatch = candidateImageText.match(/^\[\[File:([^|\]]+)((?:\|[^\]]*)*)\]\]$/i);
    if (imgMatch) {
      const parsed = parseFileParams(imgMatch[2]);
      if (parsed) {
        rawSteps.push({ isImage: true, filename: imgMatch[1].trim(), caption: parsed.caption, section });
        continue;
      }
    }

    // Without the isImage check above, notes were shown as their own
    // checkable step with a stray leading ":" left in the text.
    if (noteMatch) {
      const indent = noteMatch[1].length - 1;
      rawSteps.push({ indent, raw: noteMatch[2], section, isNote: true });
      continue;
    }
    const bulletMatch = line.match(/^(\*+)\s?(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length - 1;
      rawSteps.push({ indent, raw: bulletMatch[2], section });
    } else if (rawSteps.length > 0 && trimmed !== "") {
      // continuation of the previous step's still-open inline template
      rawSteps[rawSteps.length - 1].raw += "\n" + line;
    }
  }
}

/** True for a "structural" step (table/image) that skips the plain-text/translation pipeline entirely. */
function isStructural(step) {
  return Boolean(step.isTable || step.isImage);
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
  const rawSteps = []; // { indent, raw, section } or { isTable, table, section } or { isImage, filename, caption, section }
  for (const { heading, content } of splitIntoSections(quickGuideWikitext)) {
    // Checklist blocks, standalone wikitables (a quiz's Question/Answer table,
    // e.g. Hero's Welcome), and standalone solution images (e.g. that same
    // quest's "fully completed map" screenshot) all need to be processed in
    // the order they actually appear in the section — merge and sort by
    // source position rather than handling all of one kind first.
    const checklistBlocks = extractAllTemplatesWithPositions(content, "Checklist").map((b) => ({
      ...b,
      kind: "checklist",
    }));
    const tableBlocks = extractWikiTables(content).map((b) => ({ ...b, kind: "table" }));
    // Images that fall INSIDE a Checklist's own braces (e.g. The Elder Kiln's
    // "Tzhaar numbers" figure, nested between two bullets) are handled by
    // parseChecklistBlock itself below, positioned relative to its sibling
    // steps — must be excluded here or they'd be added a second time, in the
    // wrong place (after the whole checklist, not interleaved with it).
    const imageBlocks = extractSolutionImages(content)
      .filter((img) => !checklistBlocks.some((cl) => img.start >= cl.start && img.start < cl.end))
      .map((b) => ({ ...b, kind: "image" }));
    const blocks = [...checklistBlocks, ...tableBlocks, ...imageBlocks].sort((a, b) => a.start - b.start);

    for (const block of blocks) {
      if (block.kind === "checklist") {
        parseChecklistBlock(block.content, rawSteps, heading);
      } else if (block.kind === "table") {
        const table = parseWikiTableToStructured(block.raw);
        if (table) rawSteps.push({ isTable: true, table, section: heading });
      } else {
        rawSteps.push({ isImage: true, filename: block.filename, caption: block.caption, section: heading });
      }
    }
  }

  if (rawSteps.length === 0) {
    throw new Error("No {{Checklist|...}} block found in Quick guide wikitext");
  }

  // A step can come out empty if its wikitext was just an unrecognized inline
  // template we strip (e.g. a fairy ring code icon) — an empty instruction is
  // useless to show anyway, and sending blank lines to the translator causes
  // it to drop them inconsistently, breaking the line-count alignment check.
  // Structural steps (tables/images) are already resolved and skip this
  // plain-text pipeline entirely.
  return rawSteps
    .map((step) =>
      isStructural(step)
        ? step
        : {
            indent: step.indent,
            section: step.section,
            isNote: step.isNote,
            ...wikitextToPlain(step.raw),
          }
    )
    .filter((step) => isStructural(step) || step.text.trim() !== "")
    .map((step, index) => {
      if (step.isTable) return { index, isTable: true, section: step.section, table: step.table };
      if (step.isImage) {
        return { index, isImage: true, section: step.section, filename: step.filename, caption: step.caption };
      }
      return {
        index,
        indent: step.indent,
        section: step.section,
        ...(step.isNote ? { isNote: true } : {}),
        text: { en: step.text },
        chatOptions: step.chatOptions,
        ...(step.icons?.length ? { iconFilenames: step.icons } : {}),
        ...(step.highlightTerms?.length ? { highlightTerms: [...new Set(step.highlightTerms)] } : {}),
      };
    });
}
