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

/** Renders an inline `{{Chat options|...}}` block as compact readable text. */
function renderChatOptions(content) {
  const parts = content
    .split("|")
    .map((s) => s.replace(/\n/g, " ").trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  return ` (opciones de chat: ${parts.join(" • ")})`;
}

/**
 * Converts a chunk of raw wikitext (as found inside a Checklist step) into
 * plain, readable text: resolves [[links]], strips bold/italic markers, and
 * renders embedded {{Chat options}} templates inline.
 */
export function wikitextToPlain(raw) {
  let text = raw;

  // Inline templates we recognize get rendered; anything else just gets stripped.
  text = text.replace(/\{\{Chat options([\s\S]*?)\}\}/g, (_match, inner) => renderChatOptions(inner));
  // {{Fairycode|air}} -> "AIR" (a fairy ring teleport code) — stripping it entirely
  // leaves steps with no actual instruction (e.g. "A Fairy Tale II"'s ring codes).
  text = text.replace(/\{\{Fairycode\|([^{}|]+)\}\}/gi, (_match, code) => code.trim().toUpperCase());
  text = text.replace(/\{\{[^{}]*\}\}/g, ""); // strip any other simple inline template

  // [[Link|Display]] -> Display, [[Link]] -> Link
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");

  // '''bold''' / ''italic''
  text = text.replace(/'''([^']+)'''/g, "$1");
  text = text.replace(/''([^']+)''/g, "$1");

  return text.replace(/\s+/g, " ").trim();
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
