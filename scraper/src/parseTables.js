import { wikitextToPlain } from "./wikitext.js";

// Positional/sizing params a `[[File:...]]` link can carry in ANY order/count
// before its actual caption (e.g. "thumb|right|Caption" AND "thumb|Caption"
// are both real — the wiki doesn't fix the order). Only "thumb"/"frame(d)"
// marks it as a real floated figure worth surfacing as its own step; a plain
// inline icon-sized image (e.g. `[[File:x.png|20px]]`) must NOT match, or
// every small inline icon in a step's text would wrongly become its own step.
const IMAGE_KEYWORD_RE =
  /^(thumb(nail)?|frame(d)?|frameless|border|left|right|center|centre|none|upright(=[\d.]+)?|\d+x?\d*px|alt=.*|link=.*|page=.*|class=.*|lang=.*)$/i;

// A solution image can also skip "thumb"/"frame" entirely and just specify a
// large explicit size instead (e.g. King of the Dwarves' key-combination
// figure: "750px|centre|Caption") — real inline icons are always small
// (~15-25px) or unsized, so treat >=100px as an equally strong "this is a
// real standalone image" signal.
const LARGE_SIZE_RE = /^(\d{3,})x?\d*px$/i;

/**
 * Parses a `[[File:...]]` link's params (everything after the filename) and
 * returns `{ caption }` if it's a real floated figure (has thumb/frame, or an
 * explicitly large size), or `null` if it's just an inline icon that should
 * be left alone.
 */
export function parseFileParams(paramsString) {
  const parts = paramsString.split("|").filter((p) => p !== "");
  const isFigure = parts.some((p) => {
    const trimmed = p.trim();
    return /^(thumb(nail)?|frame(d)?)$/i.test(trimmed) || LARGE_SIZE_RE.test(trimmed);
  });
  if (!isFigure) return null;
  const captionParts = parts.filter((p) => !IMAGE_KEYWORD_RE.test(p.trim()));
  const caption = captionParts.length > 0 ? wikitextToPlain(captionParts[captionParts.length - 1]).text : null;
  return { caption };
}

/**
 * Finds every standalone `[[File:X.png|...]]` solution/puzzle image in
 * `content` — the wiki's own way of showing a screenshot next to a Checklist
 * (e.g. Hero's Welcome's "The fully completed map" next to "Solve the map
 * fragments.", or The Elder Kiln's "Tzhaar numbers" solution figure) — with
 * position, so it can be interleaved with Checklist/table blocks in real
 * source order (see parseSteps.js). Not resolved to an actual URL here (that
 * needs a network call); returns the raw filename + caption.
 */
export function extractSolutionImages(content) {
  const results = [];
  const re = /\[\[File:([^|\]]+)((?:\|[^\]]*)*)\]\]/gi;
  let match;
  while ((match = re.exec(content)) !== null) {
    const parsed = parseFileParams(match[2]);
    if (!parsed) continue;
    results.push({
      start: match.index,
      end: match.index + match[0].length,
      filename: match[1].trim(),
      caption: parsed.caption,
    });
  }
  return results;
}

/**
 * Finds every top-level `{| ... |}` wikitable block in `content`, with its
 * position (needed to interleave it with Checklist blocks in source order —
 * see parseSteps.js). The wiki's Quick guide pages sometimes drop a
 * standalone "quiz answers" or "puzzle solution" table between two
 * Checklists (e.g. Hero's Welcome's Question/Answer table), which the
 * plugin previously discarded entirely.
 */
export function extractWikiTables(content) {
  const results = [];
  const re = /\{\|[\s\S]*?\n\|\}/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    results.push({ start: match.index, end: match.index + match[0].length, raw: match[0] });
  }
  return results;
}

/**
 * True for a `{| class="wikitable lighttable" ... |}` block — the wiki's own
 * trick for a "select which of these to mark done" widget (e.g. The Mighty
 * Fall's "talk to the following goblins", each with its own {{Chat options}}
 * dialogue tree). Each row is real actionable content, not reference data,
 * but it's ALSO not a normal sequential checklist item — the wiki renders it
 * as its own clickable list with a "Clear selection" reset, separate from
 * the checklist above it. Parsing it as a normal table split every
 * {{Chat options}} param onto its own bogus column and left "{{Chat options"
 * itself un-stripped in the first cell; parsing it as normal checklist
 * bullets loses that distinct "pick one" presentation entirely.
 */
export function isLighttableBlock(raw) {
  const firstLine = raw.split("\n")[0];
  return /class\s*=\s*"[^"]*\blighttable\b[^"]*"/i.test(firstLine);
}

/**
 * Splits a `wikitable lighttable` block into one raw wikitext blob per row
 * (everything after that row's own leading `|`, including any multi-line
 * {{Chat options|...}} template that follows on subsequent lines).
 */
export function splitLighttableRows(raw) {
  const lines = raw.split("\n").slice(1); // drop the opening "{|...attrs" line
  if (lines[lines.length - 1]?.trim() === "|}") lines.pop();
  else if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].replace(/\|\}\s*$/, "");

  const rows = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("|-")) {
      if (current !== null && current !== "") rows.push(current);
      current = "";
      continue;
    }
    if (current === null) continue; // stray content before the first "|-"
    if (current === "" && trimmed.startsWith("|")) {
      current = trimmed.slice(1); // this row's first line — strip its own leading "|"
    } else {
      // Continuation line — e.g. one more `|N Dialogue text` param of this
      // row's own {{Chat options|...}} template, still open across lines.
      // Keep its leading "|" intact; that's the template's own separator.
      current += "\n" + line;
    }
  }
  if (current !== null && current !== "") rows.push(current);

  return rows;
}

function cleanCell(raw) {
  let text = raw;
  // A cell can carry wiki-table attributes before its real content, separated
  // by its own `|` (e.g. `rowspan="2" style="..." | Content`) — strip up to a
  // few of these before resolving the actual text through the shared
  // link/template stripper. Real cell content never itself starts with
  // `key="value"`, so this is safe.
  for (let i = 0; i < 3; i++) {
    const attrMatch = text.match(/^\s*[a-zA-Z-]+\s*=\s*"[^"]*"\s*(\|[\s\S]*)$/);
    if (attrMatch) text = attrMatch[1].slice(1);
    else break;
  }
  return wikitextToPlain(text).text;
}

/**
 * Converts one raw `{| ... |}` wikitable block into `{ headers, rows }` of
 * plain text. Best-effort: colspan/rowspan and embedded images are flattened
 * rather than preserved — good enough for reference tables like quiz answers
 * or NPC/location lists, though a handful of visually complex wiki tables
 * (e.g. constellation picture grids) will render plainer than the wiki.
 */
export function parseWikiTableToStructured(raw) {
  const lines = raw.split("\n").slice(1); // drop the opening "{|...attrs" line
  if (lines[lines.length - 1]?.trim() === "|}") lines.pop();
  else if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].replace(/\|\}\s*$/, "");

  const rows = [];
  let currentRow = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("|-")) {
      if (currentRow?.length) rows.push(currentRow);
      currentRow = [];
      continue;
    }
    if (line.startsWith("|+")) continue; // caption, not shown
    if (!currentRow) currentRow = [];
    if (line.startsWith("!")) {
      line
        .slice(1)
        .split("!!")
        .forEach((c) => currentRow.push({ isHeader: true, text: cleanCell(c) }));
    } else if (line.startsWith("|")) {
      line
        .slice(1)
        .split("||")
        .forEach((c) => currentRow.push({ isHeader: false, text: cleanCell(c) }));
    }
  }
  if (currentRow?.length) rows.push(currentRow);

  const cleanRows = rows.filter((row) => row.some((c) => c.text !== ""));
  if (cleanRows.length === 0) return null;

  let headers = null;
  let dataRows = cleanRows;
  if (cleanRows[0].every((c) => c.isHeader)) {
    headers = cleanRows[0].map((c) => c.text);
    dataRows = cleanRows.slice(1);
  }

  return { headers, rows: dataRows.map((row) => row.map((c) => c.text)) };
}
