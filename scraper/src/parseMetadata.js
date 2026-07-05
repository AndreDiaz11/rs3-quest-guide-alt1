import * as cheerio from "cheerio";
import { extractTemplate, parseKeyValueTemplate, wikitextToPlain } from "./wikitext.js";

const WIKI_ORIGIN = "https://runescape.wiki";

function absoluteImageUrl(src) {
  if (!src) return null;
  return src.startsWith("http") ? src : `${WIKI_ORIGIN}${src.split("?")[0]}`;
}

/**
 * Parses the infobox block from the main article's wikitext. Quests use
 * {{Infobox Quest|...}}; miniquests use {{Infobox Miniquest|...}} instead —
 * both share the same field names, so we just try Quest first and fall back.
 */
function parseInfobox(mainWikitext) {
  const content =
    extractTemplate(mainWikitext, "Infobox Quest") ?? extractTemplate(mainWikitext, "Infobox Miniquest");
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
  };
}

/** Parses the rendered `table.questdetails` from the Quick guide page's HTML. */
function parseQuestDetailsTable(quickGuideHtml) {
  const $ = cheerio.load(quickGuideHtml);
  const table = $("table.questdetails").first();

  const startCell = table.find('td[data-attr-param="startDisp"]');
  startCell.find("img, .mw-kartographer-maplink").remove();
  const startPoint = startCell.text().replace(/\s+/g, " ").trim();

  const length = table.find('td[data-attr-param="length"]').first().text().trim();

  const icon = absoluteImageUrl(table.find('td[data-attr-param="iconDisp"] img').first().attr("src"));

  // table.questreq renders the full transitive prerequisite tree (this quest's
  // requirement, that requirement's own requirement, etc.) — kept as a real
  // tree (not flattened) so the app can show it staggered exactly like the
  // wiki does. Only dedupe siblings under the SAME parent (the wiki
  // occasionally lists one twice there); the same title legitimately
  // reappearing under a different branch is not a duplicate.
  function parseRequirementNode(li) {
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
        const node = parseRequirementNode(childLi);
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

  const requiredQuests = [];
  const reqTable = table.find("table.questreq").first();
  const selfLink = reqTable.find("a.selflink, a.mw-selflink").first();
  const directUl = selfLink.closest("li").children("ul").first();
  if (directUl.length > 0) {
    const seenTitles = new Set();
    directUl.children("li").each((_, li) => {
      const node = parseRequirementNode(li);
      if (seenTitles.has(node.title)) return;
      seenTitles.add(node.title);
      requiredQuests.push(node);
    });
  }

  const requiredSkills = [];
  table.find("span.skillreq").each((_, el) => {
    const $el = $(el);
    requiredSkills.push({
      skill: $el.attr("data-skill"),
      level: Number($el.attr("data-level")),
    });
  });

  const items = [];
  table
    .find('td[data-attr-param="itemsDisp"] .lighttable.checklist li')
    .each((_, el) => {
      const $el = $(el);
      const display = $el.text().replace(/\s+/g, " ").trim();
      const link = $el.find("a").first();
      // Use the link's `title` attribute (the canonical wiki page name) for
      // image lookups, since the visible text can be pluralized/lowercased
      // ("ropes", "seaweed") and not match the actual page title ("Rope").
      // Coin amounts render as plain text with no link at all (e.g. "3 coins"),
      // so falling back to that literal text failed to resolve any image —
      // "Coins" is the real page.
      const canonicalName = /^[\d,]+\s+coins?$/i.test(display)
        ? "Coins"
        : link.attr("title") || link.text().trim() || display;
      items.push({ name: canonicalName, display });
    });

  const kills = [];
  table.find('td[data-attr-param="kills"] li').each((_, el) => {
    kills.push($(el).text().replace(/\s+/g, " ").trim());
  });

  return { startPoint, length, icon, requiredQuests, requiredSkills, items, kills };
}

export function parseMetadata({ mainWikitext, quickGuideHtml }) {
  const infobox = parseInfobox(mainWikitext);
  const details = parseQuestDetailsTable(quickGuideHtml);

  return {
    ...infobox,
    startPoint: details.startPoint,
    length: details.length || infobox.length || null,
    icon: details.icon,
    requirements: {
      quests: details.requiredQuests,
      skills: details.requiredSkills,
    },
    items: details.items,
    kills: details.kills,
  };
}
