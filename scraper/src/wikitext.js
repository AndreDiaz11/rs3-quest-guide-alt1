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
export function wikitextToPlain(raw) {
  let text = raw;
  const chatOptions = [];

  text = text.replace(/\{\{Chat options([\s\S]*?)\}\}/g, (_match, inner) => {
    chatOptions.push(...extractChatOptionsParts(inner));
    return "";
  });
  // {{Fairycode|air}} -> "AIR" (a fairy ring teleport code) — stripping it entirely
  // leaves steps with no actual instruction (e.g. "A Fairy Tale II"'s ring codes).
  text = text.replace(/\{\{Fairycode\|([^{}|]+)\}\}/gi, (_match, code) => code.trim().toUpperCase());
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

  return { text: text.replace(/\s+/g, " ").trim(), chatOptions };
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
