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

  // table.questreq renders the FULL transitive prerequisite tree (this quest's
  // requirement, that requirement's own requirement, etc. all nested), not a
  // flat list of direct requirements — grabbing every <a> in it (as before)
  // produced duplicates and picked up unrelated links buried in deeper nodes
  // (e.g. item names mentioned in a grandparent quest's own sub-requirements).
  // Only the <li> elements directly inside the selflink's own <ul> are this
  // quest's real, direct requirements.
  const requiredQuests = [];
  const reqTable = table.find("table.questreq").first();
  const selfLink = reqTable.find("a.selflink, a.mw-selflink").first();
  const directUl = selfLink.closest("li").children("ul").first();
  if (directUl.length > 0) {
    directUl.children("li").each((_, li) => {
      const $li = $(li);
      const link = $li.children("a").first();
      requiredQuests.push(link.length > 0 ? link.text().trim() : $li.clone().children("ul").remove().end().text().trim());
    });
  }
  // The wiki's own tree occasionally lists the same direct requirement twice
  // (e.g. once plainly and once as part of a combined sub-clause) — a
  // requirement should only ever be shown once regardless.
  const dedupedRequiredQuests = [...new Set(requiredQuests)];

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
      const link = $el.find("a").first();
      // Use the link's `title` attribute (the canonical wiki page name) for
      // image lookups, since the visible text can be pluralized/lowercased
      // ("ropes", "seaweed") and not match the actual page title ("Rope").
      const canonicalName = link.attr("title") || link.text().trim() || $el.text().trim();
      items.push({
        name: canonicalName,
        display: $el.text().replace(/\s+/g, " ").trim(),
      });
    });

  const kills = [];
  table.find('td[data-attr-param="kills"] li').each((_, el) => {
    kills.push($(el).text().replace(/\s+/g, " ").trim());
  });

  return { startPoint, length, icon, requiredQuests: dedupedRequiredQuests, requiredSkills, items, kills };
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
