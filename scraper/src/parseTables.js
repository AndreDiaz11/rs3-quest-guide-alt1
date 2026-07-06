import { wikitextToPlain } from "./wikitext.js";

/**
 * Finds every standalone `[[File:X.png|...|thumb|Caption]]` image in
 * `content` — the wiki's own way of showing a puzzle/solution screenshot
 * next to a Checklist (e.g. Hero's Welcome's "The fully completed map" next
 * to "Solve the map fragments.", or The Branches of Darkmeyer's 4 puzzle
 * solutions) — with position, so it can be interleaved with Checklist/table
 * blocks in real source order (see parseSteps.js). Not resolved to an actual
 * URL here (that needs a network call); returns the raw filename + caption.
 */
export function extractSolutionImages(content) {
  const results = [];
  const re = /\[\[File:([^|\]]+)\|[^\]]*\|thumb\|([^\]]+)\]\]/gi;
  let match;
  while ((match = re.exec(content)) !== null) {
    results.push({
      start: match.index,
      end: match.index + match[0].length,
      filename: match[1].trim(),
      caption: wikitextToPlain(match[2]).text,
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
