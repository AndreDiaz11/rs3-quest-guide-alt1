import {
  extractAllTemplatesWithPositions,
  wikitextToPlain,
  splitIntoSections,
  splitTemplateParams,
} from "./wikitext.js";
import {
  extractWikiTables,
  parseWikiTableToStructured,
  extractSolutionImages,
  parseFileParams,
  isLighttableBlock,
  isSingleColumnLighttable,
  splitLighttableRows,
} from "./parseTables.js";
import { fetchTemplateWikitext } from "./wikiApi.js";

// A bare `{{Some Quest solution}}` transclusion (no `|` params) — the wiki's
// way of embedding a per-quest puzzle-solution template (e.g. Some Like It
// Cold's Battlefish ship-location grid, A Void Dance's barrel-kicking
// sequence) directly in the Quick guide. These have a unique name per quest,
// so they can't be special-cased; instead the raw text is left as a
// placeholder here and resolved by fetching the template's own wikitext in
// resolveTemplateTablePlaceholders() below (network access, so it has to
// happen after this synchronous parse, not during it).
const BARE_TEMPLATE_RE = /^\{\{([^{}|]+)\}\}$/;

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
    const bareTemplateMatch = trimmed.match(BARE_TEMPLATE_RE);
    if (bulletMatch) {
      const indent = bulletMatch[1].length - 1;
      rawSteps.push({ indent, raw: bulletMatch[2], section });
    } else if (bareTemplateMatch && rawSteps.length > 0) {
      // A puzzle-solution template on its own line (typically right after a
      // "Solution:" note) — placeholder, resolved after the whole page has
      // been parsed (see resolveTemplateTablePlaceholders).
      rawSteps.push({ isTemplateTablePlaceholder: true, templateName: bareTemplateMatch[1].trim(), section });
    } else if (rawSteps.length > 0 && trimmed !== "") {
      // continuation of the previous step's still-open inline template
      rawSteps[rawSteps.length - 1].raw += "\n" + line;
    }
  }
}

/**
 * Parses a `wikitable lighttable` block's rows into a "selectable list"
 * item array — each row runs through the exact same wikitextToPlain
 * pipeline as a normal Checklist bullet (chat options, inline icons,
 * name/term highlighting, bold-emphasis), so it's a fully real step's worth
 * of content — just not rendered as a sequential checklist item (see
 * detail.js's renderSelectableList).
 */
function parseLighttableItems(raw) {
  return splitLighttableRows(raw)
    .map((rowRaw) => wikitextToPlain(rowRaw))
    .filter((item) => item.text.trim() !== "")
    .map((item) => ({
      text: { en: item.text },
      chatOptions: item.chatOptions,
      ...(item.icons?.length ? { iconFilenames: item.icons } : {}),
      ...(item.highlightTerms?.length ? { highlightTerms: [...new Set(item.highlightTerms)] } : {}),
      ...(item.boldTerms?.length ? { boldTerms: [...new Set(item.boldTerms)] } : {}),
    }));
}

/** True for a "structural" step (table/image/selectable-list/section-note/image-group) that skips the plain-text/translation pipeline entirely. */
function isStructural(step) {
  return Boolean(
    step.isTable ||
      step.isImage ||
      step.isSelectableList ||
      step.isSectionNote ||
      step.isImageGroup ||
      step.isTemplateTablePlaceholder
  );
}

/**
 * Resolves every `isTemplateTablePlaceholder` step by fetching that
 * template's own wikitext and, if it turns out to actually be a wikitable
 * (the common case for a puzzle-solution template — e.g. Some Like It Cold's
 * Battlefish grid, A Void Dance's barrel sequence), parsing it the same way
 * as any other standalone table. Anything that isn't a table (or fails to
 * fetch — a private/renamed template) is dropped silently rather than
 * leaving a broken step, same as an unrecognized inline template elsewhere.
 */
async function resolveTemplateTablePlaceholders(steps) {
  const resolved = [];
  for (const step of steps) {
    if (!step.isTemplateTablePlaceholder) {
      resolved.push(step);
      continue;
    }
    let wikitext;
    try {
      wikitext = await fetchTemplateWikitext(step.templateName);
    } catch {
      wikitext = null;
    }
    if (!wikitext || !wikitext.trim().startsWith("{|")) continue;
    const table = parseWikiTableToStructured(wikitext);
    if (table) resolved.push({ isTable: true, table, section: step.section });
  }
  return resolved;
}

/**
 * Two or more `isImage` steps with nothing else between them (no checklist
 * bullet, no other content) means the wiki placed those figures directly
 * next to each other in the wikitext — MediaWiki floats consecutive `thumb`
 * images side by side until they wrap, e.g. Elemental Workshop III's
 * "Figure 1"/"Figure 2" before/after pair. Rendered one after another
 * vertically (as separate steps) this reads as a disconnected list instead
 * of the intended side-by-side comparison — grouped into one `isImageGroup`
 * step here so the app can render them together in a row.
 */
function groupAdjacentImages(steps) {
  const result = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    if (step.isImage) {
      const group = [step];
      let j = i + 1;
      while (j < steps.length && steps[j].isImage) {
        group.push(steps[j]);
        j++;
      }
      if (group.length >= 2) {
        result.push({
          isImageGroup: true,
          section: step.section,
          images: group.map((g) => ({ filename: g.filename, caption: g.caption })),
        });
      } else {
        result.push(step);
      }
      i = j;
    } else {
      result.push(step);
      i++;
    }
  }
  return result;
}

/**
 * `{{Needed|...}}` (sometimes with a second `recommended = ...` param) sits
 * before a section's Checklist on the wiki (e.g. Pieces of Hate's "Needed: 3
 * pieces of pirate clothing") — a short prerequisite/tip note, not a step to
 * check off. Each part runs through wikitextToPlain for its own text +
 * highlight terms (linked names stay blue); translated later like a normal
 * step's text (see buildDataset.js).
 */
function parseSectionNote(sectionContent, section, rawSteps) {
  const blocks = extractAllTemplatesWithPositions(sectionContent, "Needed");
  if (blocks.length === 0) return;
  const params = splitTemplateParams(blocks[0].content);
  const recommendedRaw = params.find((p) => /^\s*recommended\s*=/i.test(p));
  const neededRaw = params.find((p) => !/^\s*recommended\s*=/i.test(p));

  const needed = neededRaw?.trim() ? wikitextToPlain(neededRaw) : null;
  const recommended = recommendedRaw ? wikitextToPlain(recommendedRaw.replace(/^\s*recommended\s*=/i, "")) : null;
  if (!needed && !recommended) return;

  rawSteps.push({
    isSectionNote: true,
    section,
    ...(needed ? { needed: { text: needed.text, highlightTerms: [...new Set(needed.highlightTerms)] } } : {}),
    ...(recommended
      ? { recommended: { text: recommended.text, highlightTerms: [...new Set(recommended.highlightTerms)] } }
      : {}),
  });
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
 * template, e.g. {{Chat options|...}}, itself spans multiple lines). Async
 * because a bare per-quest solution-template transclusion (see
 * resolveTemplateTablePlaceholders) needs a network fetch to resolve.
 */
export async function parseSteps(quickGuideWikitext) {
  const rawSteps = []; // { indent, raw, section } or { isTable, table, section } or { isImage, filename, caption, section } or { isSelectableList, items, section }
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
    // A bare `{{Some Quest solution}}` transclusion sitting BETWEEN two
    // Checklists (not inside either) — same puzzle-solution-template case as
    // the one handled inside parseChecklistBlock, just outside any Checklist.
    const templatePlaceholderBlocks = [...content.matchAll(/^[ \t]*\{\{([^{}|]+)\}\}[ \t]*$/gm)]
      .map((m) => ({ start: m.index, end: m.index + m[0].length, templateName: m[1].trim(), kind: "templatePlaceholder" }))
      .filter((tb) => !checklistBlocks.some((cl) => tb.start >= cl.start && tb.start < cl.end));
    const blocks = [...checklistBlocks, ...tableBlocks, ...imageBlocks, ...templatePlaceholderBlocks].sort(
      (a, b) => a.start - b.start
    );

    // {{Needed|...}} always sits before the section's own Checklist/table
    // blocks, so it's added first regardless of where exactly it falls.
    parseSectionNote(content, heading, rawSteps);

    for (const block of blocks) {
      if (block.kind === "checklist") {
        parseChecklistBlock(block.content, rawSteps, heading);
      } else if (block.kind === "table") {
        if (isLighttableBlock(block.raw) && isSingleColumnLighttable(block.raw)) {
          const items = parseLighttableItems(block.raw);
          if (items.length > 0) rawSteps.push({ isSelectableList: true, items, section: heading });
        } else {
          const table = parseWikiTableToStructured(block.raw);
          if (table) rawSteps.push({ isTable: true, table, section: heading });
        }
      } else if (block.kind === "templatePlaceholder") {
        rawSteps.push({ isTemplateTablePlaceholder: true, templateName: block.templateName, section: heading });
      } else {
        rawSteps.push({ isImage: true, filename: block.filename, caption: block.caption, section: heading });
      }
    }
  }

  if (rawSteps.length === 0) {
    throw new Error("No {{Checklist|...}} block found in Quick guide wikitext");
  }

  const resolvedSteps = await resolveTemplateTablePlaceholders(rawSteps);

  // A step can come out empty if its wikitext was just an unrecognized inline
  // template we strip (e.g. a fairy ring code icon) — an empty instruction is
  // useless to show anyway, and sending blank lines to the translator causes
  // it to drop them inconsistently, breaking the line-count alignment check.
  // Structural steps (tables/images/selectable-lists) are already resolved
  // and skip this plain-text pipeline entirely.
  const shapedSteps = resolvedSteps
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
    .filter((step) => isStructural(step) || step.text.trim() !== "");

  return groupAdjacentImages(shapedSteps)
    .map((step, index) => {
      if (step.isTable) return { index, isTable: true, section: step.section, table: step.table };
      if (step.isImage) {
        return { index, isImage: true, section: step.section, filename: step.filename, caption: step.caption };
      }
      if (step.isImageGroup) {
        return { index, isImageGroup: true, section: step.section, images: step.images };
      }
      if (step.isSelectableList) {
        return { index, isSelectableList: true, section: step.section, items: step.items };
      }
      if (step.isSectionNote) {
        return {
          index,
          isSectionNote: true,
          section: step.section,
          ...(step.needed ? { needed: step.needed } : {}),
          ...(step.recommended ? { recommended: step.recommended } : {}),
        };
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
        ...(step.boldTerms?.length ? { boldTerms: [...new Set(step.boldTerms)] } : {}),
      };
    });
}
