import * as cheerio from "cheerio";
import { extractTemplate, parseKeyValueTemplate, wikitextToPlain } from "./wikitext.js";

const WIKI_ORIGIN = "https://runescape.wiki";

function absoluteImageUrl(src) {
  if (!src) return null;
  return src.startsWith("http") ? src : `${WIKI_ORIGIN}${src.split("?")[0]}`;
}

// The wiki's rendered HTML shows an ambiguous floor reference (e.g. "the 2nd
// floor of a building") as BOTH regional conventions side by side — a
// `<span class="floornumber-gb">1st floor[UK]</span><span
// class="floornumber-us">2nd floor[US]</span>` pair, normally toggled by the
// reader's own locale preference client-side. Extracting plain text via
// cheerio's `.text()` (no JS execution) captures both halves concatenated
// with no separator — "1st floor[UK]2nd floor[US]" — reading as garbled
// nonsense. Collapses it down to just the UK convention (the wiki's own
// primary/default numbering) to match the single-number "Nth floor" already
// used elsewhere (see wikitext.js's {{FloorNumber|N}} template handling).
export function cleanFloorNotation(text) {
  return text.replace(
    /((?:ground|\d+(?:st|nd|rd|th))\s*floor)\[UK\](?:ground|\d+(?:st|nd|rd|th))\s*floor\[US\]/gi,
    "$1"
  );
}

/**
 * Parses the infobox block from the main article's wikitext. Quests use
 * {{Infobox Quest|...}}; miniquests use {{Infobox Miniquest|...}} instead;
 * saga sub-quests that share one combined hub page but have their own
 * separate wiki article (e.g. every Recipe for Disaster/Dimension of
 * Disaster subquest) use {{Infobox Subquest|...}} — all three share the
 * same field names, so we just try them in order and fall back.
 */
function parseInfobox(mainWikitext) {
  const content =
    extractTemplate(mainWikitext, "Infobox Quest") ??
    extractTemplate(mainWikitext, "Infobox Miniquest") ??
    extractTemplate(mainWikitext, "Infobox Subquest");
  if (content === null) return {};
  const fields = parseKeyValueTemplate(content);
  return {
    release: fields.release ? wikitextToPlain(fields.release).text : null,
    members: (fields.members || "").toLowerCase() === "yes",
    area: fields.area ? wikitextToPlain(fields.area).text : null,
    difficulty: fields.difficulty || null,
    combatLevel: fields.combat || null,
    timeline: fields.timeline || null,
    age: fields.age || null,
    series:
      fields.main_series && (fields.main_series || "").toLowerCase() !== "none" ? fields.main_series : null,
    // The wiki's own infobox card shows the series as "Void Knight #3" — the
    // number is a separate field from the series name itself.
    seriesNth: fields.series_nth || null,
    voiceOver: (fields.voice || "").toLowerCase() === "yes",
    // A second, separate icon from the main quest image (`image=`) — the
    // wiki's infobox shows both; only set when the page actually has one.
    entityIconFilename: fields.entity_icon || null,
    // Only set for the rare quest removed from the game entirely (e.g.
    // Unstable Foundations, {{Deleted content}}) — its own `removal` infobox
    // field is the wiki's canonical "removed on" date, shown as a warning
    // banner in the app since it can never actually be played/tracked again.
    removedDate: fields.removal ? wikitextToPlain(fields.removal).text : null,
  };
}

/**
 * Renders one quest-requirement node and, recursively, its own prerequisites
 * underneath it staggered one step further right — matching the wiki's own
 * indented requirement tree (e.g. Children of Mah -> The Light Within ->
 * Meeting History / The Temple at Senntisten / ...). Shared by both the
 * "Requirements" and "Follows events" (recommended-but-not-required) trees,
 * which use the exact same table.questreq markup.
 */
function parseRequirementNode($, li) {
  const $li = $(li);
  // The full text ("Ability to enter Morytania") is what gets displayed —
  // some entries have real prose around the link, not just the bare quest
  // name, and truncating to only the link's own text ("Morytania") lost
  // that context entirely. The link's text alone (when there is a link) is
  // kept separately as the exact title to match against our own dataset
  // for the ✓/✗ (matching "Ability to enter Morytania" would never find a
  // real quest called that).
  const title = $li.clone().children("ul").remove().end().text().trim();
  const link = $li.children("a").first();
  const linkTitle = link.length > 0 ? link.text().trim() : null;
  const childUl = $li.children("ul").first();
  const children = [];
  if (childUl.length > 0) {
    const seenTitles = new Set();
    childUl.children("li").each((_, childLi) => {
      const node = parseRequirementNode($, childLi);
      if (seenTitles.has(node.title)) return;
      seenTitles.add(node.title);
      children.push(node);
    });
  }
  return {
    title,
    ...(linkTitle && linkTitle !== title ? { matchTitle: linkTitle } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

/** Walks a `table.questreq` tree (found anywhere inside `scope`) into our own `{title, matchTitle?, children?}` shape. */
function parseQuestTree($, scope) {
  const quests = [];
  const reqTable = scope.find("table.questreq").first();
  const selfLink = reqTable.find("a.selflink, a.mw-selflink").first();
  const directUl = selfLink.closest("li").children("ul").first();
  if (directUl.length > 0) {
    const seenTitles = new Set();
    directUl.children("li").each((_, li) => {
      const node = parseRequirementNode($, li);
      if (seenTitles.has(node.title)) return;
      seenTitles.add(node.title);
      quests.push(node);
    });
  }
  return quests;
}

/**
 * Required/recommended items both render as a real tree on the wiki (e.g.
 * The Elder Kiln's "Melee, magic or ranged armour..." with 3 indented notes
 * underneath about Necromancy/multicannon/Summoning not working) —
 * flattening every `<li>` regardless of nesting made those notes look like
 * their own unrelated top-level items instead of caveats attached to the
 * item above them. Shared by "Required items" and "Recommended".
 */
function parseItemNode($, li) {
  const $li = $(li);
  const childUl = $li.children("ul").first();
  // .remove() returns the REMOVED elements, not the modified clone — .end()
  // steps back to the clone (with the nested <ul> now gone) before reading
  // its text/link, or `display`/`name` come out empty for every leaf item.
  const withoutChildren = $li.clone().children("ul").remove().end();
  withoutChildren.find("figure").remove(); // strip any inline reference screenshot before reading text/link
  const display = cleanFloorNotation(withoutChildren.text().replace(/\s+/g, " ").trim());
  const link = withoutChildren.find("a").first();
  // Use the link's `title` attribute (the canonical wiki page name) for
  // image lookups, since the visible text can be pluralized/lowercased
  // ("ropes", "seaweed") and not match the actual page title ("Rope"). A
  // combat-level/skill requirement (e.g. Recommended's "100 combat level")
  // renders as a <span class="skillreq"> with its own link — same handling
  // picks up "Combat level"/the real skill name as the canonical name so it
  // can reuse a skill icon later, same as the Requirements section.
  // Coin amounts render as plain text with no link at all (e.g. "3 coins"),
  // so falling back to that literal text failed to resolve any image —
  // "Coins" is the real page.
  const name = /^[\d,]+\s+coins?$/i.test(display) ? "Coins" : link.attr("title") || link.text().trim() || display;
  const children = [];
  if (childUl.length > 0) {
    childUl.children("li").each((_, childLi) => children.push(parseItemNode($, childLi)));
  }
  return { name, display, ...(children.length > 0 ? { children } : {}) };
}

/** Walks a `.lighttable.checklist > ul` (found anywhere inside `scope`) into our own `{name, display, children?}` shape. */
function parseItemTree($, scope) {
  const items = [];
  scope
    .find(".lighttable.checklist > ul")
    .first()
    .children("li")
    .each((_, el) => items.push(parseItemNode($, el)));
  return items;
}

/** Parses the rendered `table.questdetails` from the Quick guide page's HTML. */
function parseQuestDetailsTable(quickGuideHtml) {
  const $ = cheerio.load(quickGuideHtml);
  const table = $("table.questdetails").first();

  const startCell = table.find('td[data-attr-param="startDisp"]');
  // The wiki's own "(via [interactive map link])" note loses its link text
  // entirely once the map link itself is stripped below (its visible text is
  // just a generic "a location"/"Show on map", not useful without the actual
  // interactive map) — left an empty, dangling "(via )" in the plain text.
  // Dropped as a whole phrase instead, same as removing the link itself.
  startCell.find("img, .mw-kartographer-maplink").remove();
  const startPoint = cleanFloorNotation(
    startCell
      .text()
      .replace(/\s+/g, " ")
      .replace(/\(\s*via\s*\)/gi, "")
      .trim()
  );

  const length = table.find('td[data-attr-param="length"]').first().text().trim();

  const icon = absoluteImageUrl(table.find('td[data-attr-param="iconDisp"] img').first().attr("src"));

  const requiredQuests = parseQuestTree($, table);
  // "Follows events" — quests recommended but NOT required for full storyline
  // comprehension (e.g. The Void Stares Back's "Conquest tutorial") — same
  // tree shape as Requirements, scoped to its own table cell.
  const followsEvents = parseQuestTree($, table.find('td[data-attr-param="followsDisp"]'));

  // Required skills live outside any data-attr-param cell (a plain bullet
  // list right under the quest-requirement tree); "Recommended" is the only
  // OTHER place skillreq spans appear (e.g. "100 combat level"), and those
  // are optional, not required — must exclude them explicitly here or they'd
  // get counted as hard requirements.
  const requiredSkills = [];
  table.find("span.skillreq").each((_, el) => {
    const $el = $(el);
    if ($el.closest('[data-attr-param="recommendedDisp"]').length > 0) return;
    requiredSkills.push({
      skill: $el.attr("data-skill"),
      level: Number($el.attr("data-level")),
    });
  });

  const items = parseItemTree($, table.find('td[data-attr-param="itemsDisp"]'));
  // "Recommended" — suggested-but-optional gear/combat level/food/potions
  // (e.g. The Void Stares Back's "100 combat level", "High level food",
  // "Prayer potions") — same tree shape as Required items.
  const recommended = parseItemTree($, table.find('td[data-attr-param="recommendedDisp"]'));

  const kills = [];
  table.find('td[data-attr-param="kills"] li').each((_, el) => {
    kills.push(cleanFloorNotation($(el).text().replace(/\s+/g, " ").trim()));
  });

  return { startPoint, length, icon, requiredQuests, followsEvents, requiredSkills, items, recommended, kills };
}

// Hub quests (Recipe for Disaster, Dimension of Disaster, Once Upon a Time
// in Gielinor, That Old Black Magic) each link to their own sub-quests a
// DIFFERENT way — a plain [[Title/Quick guide|Display]] link, a
// {{QuestIcon|Title/Quick guide|...}} template, or a {{:Title/Quick guide}}
// transclusion. Scanned across BOTH the main article and the Quick guide
// wikitext since one hub (Once Upon a Time in Gielinor) has no Quick guide
// of its own — that page is a redirect, so its sub-quest links only exist on
// the main article.
//
// {{QuestIcon|...}}/{{:Title}} mark the real sub-quest GRID (the actual
// in-game selectable icons) — Recipe for Disaster's page uses this for its 8
// real "freeing council member" sub-quests, but ALSO has 2 plain [[ ]] prose
// links to genuinely separate pages that aren't part of that grid: "Starting
// the first subquest [[...Another Cook's Quest/Quick guide|...]]" (a linear
// prerequisite intro, completed once and never re-selectable) and "Start the
// last subquest [[...Defeating the Culinaromancer/Quick guide|...]]" (the
// automatic finale after all 8 are done) — the real client's own info panel
// confirms neither is shown as one of the hub's selectable icons. So: when a
// page has ANY {{QuestIcon|...}}/{{:Title}} match, those take priority and
// plain [[ ]] links are ignored as prose exceptions. Only when a hub has NO
// such widget match at all (Dimension of Disaster, Once Upon a Time in
// Gielinor — both represent their real 4 sub-quests as plain links with no
// QuestIcon grid) do plain [[ ]] links get used as the real sub-quest list.
//
// Deliberately does NOT match {{Main|Title/Quick guide}} — that template
// means "see also", used just as often for a genuine PREREQUISITE quest as
// for an actual sub-quest (e.g. Dimension of Disaster's own "Coin of the
// Realm" starter quest is referenced this way).
const WIDGET_SUBQUEST_LINK_RE = /\{\{(?:QuestIcon\||:)([^[\]{}|]+?)\/Quick guide/g;
const PLAIN_SUBQUEST_LINK_RE = /\[\[([^[\]{}|]+?)\/Quick guide/g;

function collectTitles(re, text) {
  const seen = new Set();
  const titles = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    const title = match[1].trim();
    if (!seen.has(title)) {
      seen.add(title);
      titles.push(title);
    }
  }
  return titles;
}

/**
 * Returns `{ subquests, bonusQuests }`. `subquests` is the hub's real
 * selectable-icon grid (matching the client's own info panel, see the
 * comment above). `bonusQuests` catches genuinely separate quest pages the
 * hub links to OUTSIDE that grid — e.g. Recipe for Disaster's own linear
 * intro ("Another Cook's Quest") and automatic finale ("Defeating the
 * Culinaromancer"), each with a real Quick guide of its own, just not shown
 * as one of the hub's 8 selectable icons in-game. Only populated for hubs
 * that use the {{QuestIcon|...}}/{{:Title}} widget (a plain-link match
 * dropped in favor of widget matches is exactly this "extra, real, but
 * non-grid" case) — hubs with no widget at all (Dimension of Disaster, Once
 * Upon a Time in Gielinor) already use every plain link as their real grid,
 * so there's nothing left over to bucket here.
 */
export function extractSubquestTitles({ mainWikitext, quickGuideWikitext }) {
  const combined = `${mainWikitext || ""}\n${quickGuideWikitext || ""}`;
  const widgetTitles = collectTitles(WIDGET_SUBQUEST_LINK_RE, combined);
  if (widgetTitles.length > 0) {
    const plainTitles = collectTitles(PLAIN_SUBQUEST_LINK_RE, combined);
    const widgetSet = new Set(widgetTitles);
    const bonusQuests = plainTitles.filter((t) => !widgetSet.has(t));
    return { subquests: widgetTitles, bonusQuests };
  }
  return { subquests: collectTitles(PLAIN_SUBQUEST_LINK_RE, combined), bonusQuests: [] };
}

// Hub quests (e.g. Once Upon a Time in Gielinor) and other pages with no
// Quick guide of their own have no `table.questdetails` HTML to read a
// length from (parseQuestDetailsTable needs quickGuideHtml, which is null
// for them) — but the main article page itself still embeds its own
// `{{Quest details|...|length=...}}` template (under its own "Overview"
// heading) with the real value. Read straight from that wikitext as a
// fallback instead of silently leaving `length` null for every such page.
function parseMainArticleLength(mainWikitext) {
  const content = extractTemplate(mainWikitext, "Quest details");
  if (content === null) return null;
  const fields = parseKeyValueTemplate(content);
  return fields.length || null;
}

export function parseMetadata({ mainWikitext, quickGuideHtml }) {
  const infobox = parseInfobox(mainWikitext);
  const details = parseQuestDetailsTable(quickGuideHtml || "");

  return {
    ...infobox,
    startPoint: details.startPoint,
    length: details.length || parseMainArticleLength(mainWikitext) || null,
    icon: details.icon,
    requirements: {
      quests: details.requiredQuests,
      skills: details.requiredSkills,
    },
    followsEvents: details.followsEvents,
    items: details.items,
    recommended: details.recommended,
    kills: details.kills,
  };
}
