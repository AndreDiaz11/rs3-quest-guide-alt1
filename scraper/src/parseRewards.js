import * as cheerio from "cheerio";

function parseLeadingAmount(text) {
  const match = text.match(/^([\d,]+)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function parseRewardListItem($, el) {
  // A reward line can embed its own reference screenshot inline (e.g. The
  // Elder Kiln's "2 quest points" li also contains a <figure> of the Early
  // Bird bonus screen) — strip it before reading text/links, or its caption
  // ("The Early Bird reward screen for...") gets appended onto the reward's
  // own text, and its own <a> could get mistaken for the reward's item link.
  const $el = $(el).clone();
  $el.find("figure").remove();
  const text = $el.text().replace(/\s+/g, " ").trim();

  if (/quest point/i.test(text)) {
    return { type: "questPoints", amount: parseLeadingAmount(text) || 1, display: text };
  }

  if (/experience/i.test(text)) {
    // The skill link's visible text is often just an icon (no text content),
    // so the skill name has to come from the link's `title` attribute.
    const skillLink = $el.find('a[href^="/w/"]').first();
    return {
      type: "xp",
      skill: skillLink.attr("title") || skillLink.text().trim() || null,
      amount: parseLeadingAmount(text),
      display: text,
    };
  }

  // Coin rewards render as plain text with no link at all (e.g. "500 coins"),
  // so the item name would otherwise fall back to the literal quantity-
  // prefixed text and fail to resolve an image — "Coins" is the real page.
  if (/^[\d,]+\s+coins?$/i.test(text)) {
    return { type: "item", name: "Coins", display: text };
  }

  const itemLink = $el.find('a[href^="/w/"]').first();
  return {
    type: "item",
    name: itemLink.attr("title") || itemLink.text().trim() || text,
    display: text,
  };
}

/**
 * Parses the Rewards section of a Quick guide's rendered HTML: the main
 * rewards list plus any "Additional rewards/activities" list that follows
 * (post-quest content, e.g. manual reward claims — kept for display only,
 * per the agreed simplification these are never auto-checked differently).
 */
export function parseRewards(quickGuideHtml) {
  const $ = cheerio.load(quickGuideHtml);
  const heading = $("#Rewards");
  if (heading.length === 0) return { rewards: [], postQuest: [] };

  const sectionRoot = heading.closest(".mw-heading");
  const rewards = [];
  const postQuest = [];
  // `currentTarget` starts as the main rewards list and only ever switches to
  // postQuest on an actual "Additional rewards" marker; other sub-headings
  // (e.g. "All players", "Members-only") just relabel whichever list is
  // currently active instead of resetting it, since the wiki nests them
  // *inside* the Additional rewards block when one already started. "Music
  // unlocked" is the one heading that always belongs back in the main
  // visible reward list (with its own subheading), even if it happens to
  // appear after an Additional rewards block in the source.
  let currentTarget = rewards;
  let currentGroup = null;
  let rewardBannerImage = null;

  let node = sectionRoot.next();
  while (node.length && !node.is(".mw-heading")) {
    if (node.is("figure") && !rewardBannerImage) {
      // The wiki's own reward banner image (e.g. "X reward.png"), shown above
      // the reward list on the actual quest page.
      const src = node.find("img").attr("src");
      if (src) rewardBannerImage = src.startsWith("http") ? src : `https://runescape.wiki${src}`;
    } else if (!rewardBannerImage && (node.is(".switch-infobox") || node.find(".switch-infobox").length > 0)) {
      // Quests with a player-chosen reward (e.g. Roving Elves' bow-or-ward)
      // wrap the banner in a JS tab switcher instead of a plain <figure> —
      // use whichever variant's image is shown by default.
      const scope = node.is(".switch-infobox") ? node : node.find(".switch-infobox").first();
      const img = scope.find(".item.showing img, .item img").first();
      const src = img.attr("src");
      if (src) rewardBannerImage = src.startsWith("http") ? src : `https://runescape.wiki${src}`;
    } else if (node.is("dl")) {
      const label = node.text().replace(/\s+/g, " ").trim();
      if (/music unlocked/i.test(label)) {
        currentTarget = rewards;
        currentGroup = "Music unlocked";
      } else if (/additional rewards/i.test(label)) {
        currentTarget = postQuest;
        currentGroup = null;
      } else {
        currentGroup = label || currentGroup;
      }
    } else if (node.is("ul")) {
      node.find("> li").each((_, el) => {
        const item = parseRewardListItem($, el);
        if (currentTarget === rewards && currentGroup) item.group = currentGroup;
        currentTarget.push(item);
      });
    }
    node = node.next();
  }

  return { rewards, postQuest, rewardBannerImage };
}
