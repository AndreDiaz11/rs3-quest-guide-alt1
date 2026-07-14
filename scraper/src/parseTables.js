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
 * Finds every `<gallery>...</gallery>` block's images (e.g. Sliske's
 * Endgame's two maze-solution maps, shown side by side on the wiki) — a
 * different image syntax than `[[File:...|thumb|caption]]`, one plain
 * "Filename.png|Caption" per line, with no positional params at all. Each
 * image gets a synthetic position (block start + its index) so it sorts
 * correctly against Checklist/table blocks in parseSteps.js, and so multiple
 * images from the same gallery land adjacent in the final step order — which
 * makes them fall into the existing "isImageGroup" side-by-side grouping.
 */
export function extractGalleryImages(content) {
  const results = [];
  const re = /<gallery[^>]*>([\s\S]*?)<\/gallery>/gi;
  let match;
  while ((match = re.exec(content)) !== null) {
    const blockStart = match.index;
    const lines = match[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    lines.forEach((line, i) => {
      const [filenamePart, ...captionParts] = line.split("|");
      // Gallery lines can optionally repeat the "File:"/"Image:" namespace
      // prefix per-line (unlike [[File:...]] links, where it's mandatory) —
      // must be stripped here too, or resolveFileUrls ends up looking up
      // "File:File:Name.png" and silently fails to resolve a real image.
      const filename = filenamePart.trim().replace(/^(File|Image):/i, "");
      if (!filename) return;
      results.push({
        start: blockStart + i,
        end: blockStart + i,
        filename,
        caption: captionParts.join("|").trim() || null,
      });
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
 * True only for a `lighttable` block that's genuinely the wiki's "select
 * which of these to mark done" widget — single column, one full action per
 * row (e.g. The Mighty Fall's goblins). The SAME `lighttable`/`wikitable
 * lighttable` class is ALSO reused by the wiki for plain multi-column
 * reference tables (quiz answers, ingredient/location lists, memory/location
 * lists) — those have a header row and/or 2+ cells per row, and must be
 * routed through the normal structured-table renderer instead, or their
 * columns get smashed together into garbled text (confirmed on A Void
 * Dance's clue table, Big Chompy Bird Hunting's ingredient list, and 5
 * others). `{{Chat options|...}}` spanning multiple physical lines (each
 * starting with its own `|param`) must NOT count as extra cells — tracked via
 * a simple `{{`/`}}` depth so those lines are skipped while the template is open.
 */
export function isSingleColumnLighttable(raw) {
  const lines = raw.split("\n").slice(1);
  if (lines[lines.length - 1]?.trim() === "|}") lines.pop();
  else if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].replace(/\|\}\s*$/, "");
  let depth = 0;
  let cellsInRow = 0;
  let maxCells = 0;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("|+")) continue;
    if (depth === 0 && trimmed.startsWith("!")) return false; // header row -> real reference table
    if (depth === 0 && trimmed.startsWith("|-")) {
      maxCells = Math.max(maxCells, cellsInRow);
      cellsInRow = 0;
    } else if (depth === 0 && trimmed.startsWith("|")) {
      cellsInRow += trimmed.includes("||") ? 2 : 1;
    }
    for (let i = 0; i < rawLine.length; i++) {
      if (rawLine.startsWith("{{", i)) depth++;
      else if (rawLine.startsWith("}}", i)) depth = Math.max(0, depth - 1);
    }
  }
  maxCells = Math.max(maxCells, cellsInRow);
  return maxCells <= 1;
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

// `{{NA|colspan=N|}}` (or bare `{{NA|}}`, colspan defaults to 1) is the
// wiki's own "blocked/not applicable" filler cell for grid-shaped puzzle
// diagrams (e.g. Eclipse of the Heart's sliding-tile solutions) — used
// instead of a native wikitable `colspan="N"` attribute.
const NA_CELL_RE = /^\{\{NA\|(?:colspan\s*=\s*(\d+)\s*\|?)?\}\}$/i;

/**
 * Parses one raw cell token (everything after a row's `|`/`!`/`||`/`!!`
 * separator, before cleaning) into `{ text, blocked, colspan, rowspan }`.
 * Handles both the `{{NA|colspan=N}}` template convention and native
 * wikitable `rowspan="N"`/`colspan="N"` attributes (e.g. Lunar Diplomacy's
 * dice-roll answer table mixes both in the same block).
 */
function parseCellToken(raw) {
  const naMatch = raw.trim().match(NA_CELL_RE);
  if (naMatch) {
    return { text: "", blocked: true, colspan: naMatch[1] ? Number(naMatch[1]) : 1, rowspan: 1 };
  }

  let text = raw.replace(/<br\s*\/?>/gi, " ");
  let rowspan = 1;
  let colspan = 1;
  // A cell can carry one or more wiki-table attributes before its real
  // content, separated from it by its own `|` (e.g. `rowspan="2"
  // style="..." | Content`, or an unquoted one like `width=19|Content`) —
  // strip each attribute token in turn (there can be several in a row before
  // the pipe, e.g. `width="120" height="80" | Content`), capturing
  // rowspan/colspan values along the way, then drop the one leading pipe
  // left over. Real cell content never itself starts with `key=value`, so
  // this is safe.
  for (let i = 0; i < 4; i++) {
    const attrMatch = text.match(/^\s*([a-zA-Z-]+)\s*=\s*("[^"]*"|[^|\s]+)\s*/);
    if (!attrMatch) break;
    const key = attrMatch[1].toLowerCase();
    const value = attrMatch[2].replace(/^"|"$/g, "");
    if (key === "rowspan") rowspan = Number(value) || 1;
    else if (key === "colspan") colspan = Number(value) || 1;
    text = text.slice(attrMatch[0].length);
  }
  text = text.replace(/^\|/, "");
  // A native `colspan="N" {{NA}}` attribute (as opposed to the template-only
  // `{{NA|colspan=N}}` convention checked above) still needs to be flagged
  // blocked once its colspan attribute is already stripped off above (e.g.
  // Lunar Diplomacy's dice-answer table spacer bar uses this exact form).
  if (/^\{\{NA\|?\}\}$/i.test(text.trim())) {
    return { text: "", blocked: true, colspan, rowspan };
  }
  // {{yes|N}}/{{no|N}} are the wiki's own tick/cross icon templates (e.g. a
  // puzzle-solution grid marking which cells hold a ship) — the generic
  // inline-template stripper elsewhere would otherwise just delete them,
  // leaving a blank cell with no indication a mark was ever there.
  text = text.replace(/\{\{yes\|[^{}]*\}\}/gi, "✓").replace(/\{\{no\|[^{}]*\}\}/gi, "✗");
  return { text: wikitextToPlain(text).text, blocked: false, colspan, rowspan };
}

/**
 * Expands one row's parsed cell tokens against columns still occupied by a
 * `rowspan` from an earlier row (tracked in `carry`, keyed by column index)
 * into a flat array of `{ text, blocked }` — one per actual column. A
 * `rowspan="N"` cell registers `N - 1` more rows' worth of a blank
 * continuation cell in `carry` at its own column(s) (blank because a merged
 * cell's content visually shows once, not repeated per row); a `colspan="N"`
 * cell fills its extra columns with a blank cell the same way. Both can
 * combine (e.g. Lunar Diplomacy's `colspan="7" {{NA}}` blocked spacer bar
 * above a `rowspan="10"` blank divider column between two mini-tables).
 */
function expandRowAgainstCarry(cells, carry) {
  const outRow = [];
  let col = 0;
  let i = 0;
  while (true) {
    if (carry[col] && carry[col].remaining > 0) {
      outRow[col] = { text: "", blocked: carry[col].blocked };
      carry[col].remaining--;
      if (carry[col].remaining === 0) delete carry[col];
      col++;
      continue;
    }
    if (i < cells.length) {
      const cell = cells[i];
      i++;
      for (let j = 0; j < cell.colspan; j++) {
        outRow[col] = { text: j === 0 ? cell.text : "", blocked: cell.blocked };
        if (cell.rowspan > 1) carry[col] = { blocked: cell.blocked, remaining: cell.rowspan - 1 };
        col++;
      }
      continue;
    }
    break;
  }
  return outRow;
}

/**
 * Converts one raw `{| ... |}` wikitable block into `{ headers, rows }` of
 * plain text. `rowspan`/`colspan` (native attributes or the `{{NA|colspan}}`
 * template convention) are preserved by flattening a spanning cell's value
 * into every column/row it visually covers — good enough for reference
 * tables like quiz answers or NPC/location lists, as well as grid-shaped
 * puzzle diagrams, though a handful of visually complex wiki tables (e.g.
 * constellation picture grids) will still render plainer than the wiki.
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
        .forEach((c) => currentRow.push({ isHeader: true, ...parseCellToken(c) }));
    } else if (line.startsWith("|")) {
      line
        .slice(1)
        .split("||")
        .forEach((c) => currentRow.push({ isHeader: false, ...parseCellToken(c) }));
    }
  }
  if (currentRow?.length) rows.push(currentRow);

  const cleanRows = rows.filter((row) => row.some((c) => c.text !== "" || c.blocked));
  if (cleanRows.length === 0) return null;

  let headers = null;
  let dataRows = cleanRows;
  if (cleanRows[0].every((c) => c.isHeader)) {
    // Headers are a single row with no rowspan carry-in from above, but can
    // still use colspan (e.g. a merged header spanning two data columns).
    headers = expandRowAgainstCarry(cleanRows[0], {}).map((c) => c.text);
    dataRows = cleanRows.slice(1);
  }

  const carry = {};
  return { headers, rows: dataRows.map((row) => expandRowAgainstCarry(row, carry)) };
}
