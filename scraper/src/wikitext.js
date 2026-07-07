/**
 * Minimal wikitext helpers — not a full wikitext parser, just enough to pull
 * the Checklist/Infobox templates and turn wiki markup into plain readable text.
 */

/**
 * Finds the first `{{TemplateName ...}}` occurrence and returns its content
 * (everything after the first `|`), matching nested `{{ }}` braces so templates
 * containing other templates (e.g. Checklist containing Chat options) work.
 */
export function extractTemplate(wikitext, templateName) {
  const marker = `{{${templateName}`;
  const start = wikitext.indexOf(marker);
  if (start === -1) return null;

  let depth = 0;
  let i = start;
  for (; i < wikitext.length; i++) {
    if (wikitext.startsWith("{{", i)) {
      depth++;
      i++;
    } else if (wikitext.startsWith("}}", i)) {
      depth--;
      i++;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }

  const full = wikitext.slice(start, i);
  const pipeIndex = full.indexOf("|");
  if (pipeIndex === -1) return "";
  return full.slice(pipeIndex + 1, -2);
}

/** Same as extractTemplate but returns every top-level match, not just the first. */
export function extractAllTemplates(wikitext, templateName) {
  const results = [];
  let searchFrom = 0;
  while (true) {
    const marker = `{{${templateName}`;
    const start = wikitext.indexOf(marker, searchFrom);
    if (start === -1) break;
    const rest = extractTemplate(wikitext.slice(start), templateName);
    if (rest === null) break;
    results.push(rest);
    searchFrom = start + marker.length;
  }
  return results;
}

/**
 * Same as extractAllTemplates but also returns each match's `start`/`end`
 * position in `wikitext` — needed when a section's other content (e.g. a
 * standalone wikitable) must be interleaved with these blocks in source order.
 */
export function extractAllTemplatesWithPositions(wikitext, templateName) {
  const results = [];
  const marker = `{{${templateName}`;
  let searchFrom = 0;
  while (true) {
    const start = wikitext.indexOf(marker, searchFrom);
    if (start === -1) break;
    let depth = 0;
    let i = start;
    for (; i < wikitext.length; i++) {
      if (wikitext.startsWith("{{", i)) {
        depth++;
        i++;
      } else if (wikitext.startsWith("}}", i)) {
        depth--;
        i++;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    const full = wikitext.slice(start, i);
    const pipeIndex = full.indexOf("|");
    const content = pipeIndex === -1 ? "" : full.slice(pipeIndex + 1, -2);
    results.push({ start, end: i, content });
    searchFrom = i;
  }
  return results;
}

/**
 * Extracts the raw parts of an inline `{{Chat options|...}}` block, kept in
 * English on purpose (they're literal in-game UI buttons/markers, not shown
 * translated — see app/js/detail.js chat options popup).
 */
function extractChatOptionsParts(content) {
  return content
    .split("|")
    .map((s) => s.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

/**
 * Converts a chunk of raw wikitext (as found inside a Checklist step) into
 * plain, readable text: resolves [[links]], strips bold/italic markers, and
 * pulls out any embedded {{Chat options}} template into a separate array
 * instead of inlining it (so the app can render it as its own popup).
 * Returns { text, chatOptions }.
 */
const ORDINAL_SUFFIXES = { one: "st", two: "nd", few: "rd", other: "th" };
const ordinalFormatter = new Intl.PluralRules("en", { type: "ordinal" });
function ordinal(n) {
  return `${n}${ORDINAL_SUFFIXES[ordinalFormatter.select(n)]}`;
}

// Mirrors parseTables.js's own figure-detection signals (kept separate, not
// imported, to avoid a circular import between the two modules): thumb/frame,
// or an explicit size of 100px or more (real inline icons are always small).
const FIGURE_KEYWORD_RE = /\|\s*(?:thumb(?:nail)?|frame(?:d)?|\d{3,}x?\d*px)\s*(\||\])/i;

// Skill names are already highlighted with their own icon in the
// Requirements/Recommended sections — excluded here so a step mentioning
// "Magic" doesn't ALSO get a generic name-highlight treatment on top of that.
const SKILL_NAMES = new Set([
  "attack", "defence", "strength", "constitution", "ranged", "prayer", "magic",
  "cooking", "woodcutting", "fletching", "fishing", "firemaking", "crafting",
  "smithing", "mining", "herblore", "agility", "thieving", "slayer", "farming",
  "runecrafting", "hunter", "construction", "summoning", "dungeoneering",
  "divination", "invention", "archaeology", "necromancy",
]);

export function wikitextToPlain(raw) {
  let text = raw;
  const chatOptions = [];
  const icons = [];
  const highlightTerms = [];

  // Any real [[wiki link]] in a step (NPCs, monsters, places, items) is worth
  // calling out visually, matching how the wiki itself makes these blue — but
  // as a plain highlight, not a real hyperlink. Collected before the generic
  // [[Link|Display]] stripping below removes the brackets; skill names are
  // excluded (already get their own icon treatment elsewhere).
  const collectLink = (displayText) => {
    const clean = displayText.trim();
    if (clean.length > 1 && !SKILL_NAMES.has(clean.toLowerCase())) highlightTerms.push(clean);
  };
  text.replace(/\[\[(?!File:)([^\]|]+)\|([^\]]+)\]\]/gi, (_match, _link, display) => {
    collectLink(display);
    return _match;
  });
  text.replace(/\[\[(?!File:)([^\]|]+)\]\]/gi, (_match, link) => {
    collectLink(link);
    return _match;
  });

  // A bare inline icon (e.g. "[[File:Mining spot map icon.png]] [[TzHaar City
  // mine]]" — a small icon right before the place name it illustrates, no
  // caption/size params) was falling through to the generic [[Link]] handler
  // below, which doesn't know about File: links and left the literal
  // "File:Mining spot map icon.png" text in the step. Standalone floating
  // figures (thumb/frame) are handled structurally elsewhere (parseSteps.js)
  // and never reach this function, so anything left here is safe to treat as
  // a small inline icon: pull it out (shown as its own icon in the app,
  // se attaches to the step, not embedded mid-sentence since word order
  // shifts across translation) and remove it from the flowing text.
  text = text.replace(/\[\[File:([^|\]]+)((?:\|[^\]]*)*)\]\]/gi, (match, filename) => {
    if (FIGURE_KEYWORD_RE.test(match)) return match; // leave any stray figure alone, don't mangle it here
    icons.push(filename.trim());
    return "";
  });

  // {{Chat option|...}} (singular) is used interchangeably with the plural
  // {{Chat options|...}} on some pages — both need to be captured, or the
  // singular form falls through to the generic template-stripper below and
  // silently disappears (dialogue AND the chat button both go missing).
  text = text.replace(/\{\{Chat options?([\s\S]*?)\}\}/gi, (_match, inner) => {
    chatOptions.push(...extractChatOptionsParts(inner));
    return "";
  });
  // {{Fairycode|air}} / {{fairy ring|DJP}} / {{fairyring|djp}} -> "AIR"/"DJP"
  // (a fairy ring teleport code — three different template names/spacings
  // the wiki uses interchangeably) — stripping it entirely leaves steps with
  // no actual instruction.
  text = text.replace(/\{\{Fairycode\|([^{}|]+)\}\}/gi, (_match, code) => code.trim().toUpperCase());
  text = text.replace(/\{\{fairy ?ring\|([^{}|]+)\}\}/gi, (_match, code) => code.trim().toUpperCase());
  // {{FloorNumber|3}} or {{FloorNumber|uk=1}}/{{FloorNumber|us=2}} -> "3rd floor" —
  // stripping it entirely left steps reading "the of the Wizards' Tower" with
  // the floor silently gone. Named uk=/us= params both just take the number.
  text = text.replace(/\{\{Floor[ _]?number\|(?:(?:uk|us)\s*=\s*)?(\d+)\}\}/gi, (_match, n) =>
    Number(n) === 0 ? "ground floor" : `${ordinal(Number(n))} floor`
  );
  // {{Coins|{{GEP|Item|qty}} + {{GEP|Item2|qty2}}}} -> live Grand Exchange price
  // lookups nested inside a Coins template — not resolvable without querying
  // the GE API, so render as a plain-language placeholder instead of leaving
  // it blank ("Buy from the Grand Exchange for .").
  text = text.replace(/\{\{Coins\|[\s\S]*?\}\}\}\}/gi, "the market price").replace(/\{\{Coins\|[^{}]*\}\}/gi, "the market price");
  // {{plink|Item name}} / {{plink|Page name|txt=Display text}} -> an item's icon+link
  // template — stripping it entirely (as any other unrecognized template) left
  // steps reading "obtain a ." with the item name silently gone.
  text = text.replace(/\{\{plink\|([^{}]*)\}\}/gi, (_match, inner) => {
    const parts = inner.split("|").map((p) => p.trim());
    const txtParam = parts.find((p) => /^txt\s*=/i.test(p));
    if (txtParam) return txtParam.replace(/^txt\s*=/i, "").trim();
    return parts[0] || "";
  });
  text = text.replace(/\{\{[^{}]*\}\}/g, ""); // strip any other simple inline template

  // [[Link|Display]] -> Display, [[Link]] -> Link
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");

  // '''bold''' / ''italic''
  text = text.replace(/'''([^']+)'''/g, "$1");
  text = text.replace(/''([^']+)''/g, "$1");

  return { text: text.replace(/\s+/g, " ").trim(), chatOptions, icons, highlightTerms };
}

/**
 * Splits a Quick guide's wikitext into `{ heading, content }` sections, each
 * `content` being the raw wikitext between one `==Heading==` (any level) and
 * the next. Text before the first heading is returned under `heading: null`.
 */
export function splitIntoSections(wikitext) {
  const headingRe = /^={2,4}\s*(.+?)\s*={2,4}\s*$/gm;
  const sections = [];
  let lastIndex = 0;
  let lastHeading = null;
  let match;
  while ((match = headingRe.exec(wikitext)) !== null) {
    sections.push({ heading: lastHeading, content: wikitext.slice(lastIndex, match.index) });
    lastHeading = match[1];
    lastIndex = headingRe.lastIndex;
  }
  sections.push({ heading: lastHeading, content: wikitext.slice(lastIndex) });
  return sections;
}

/** Parses a flat `{{Infobox X|key = value|key2 = value2}}` block into an object. */
export function parseKeyValueTemplate(content) {
  const result = {};
  // Split on lines starting with '|' at the start of a field (top-level only;
  // infobox fields on this wiki are one-per-line, values do not contain raw '|').
  const lines = content.split(/\n(?=\|)/);
  for (const line of lines) {
    const trimmed = line.replace(/^\|/, "");
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}
