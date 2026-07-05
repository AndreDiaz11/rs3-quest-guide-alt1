import * as cheerio from "cheerio";

function parseLeadingAmount(text) {
  const match = text.match(/^([\d,]+)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function parseRewardListItem($, el) {
  const $el = $(el);
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
  let pastAdditionalMarker = false;
  let rewardBannerImage = null;

  let node = sectionRoot.next();
  while (node.length && !node.is(".mw-heading")) {
    if (node.is("figure") && !rewardBannerImage) {
      // The wiki's own reward banner image (e.g. "X reward.png"), shown above
      // the reward list on the actual quest page.
      const src = node.find("img").attr("src");
      if (src) rewardBannerImage = src.startsWith("http") ? src : `https://runescape.wiki${src}`;
    } else if (node.is("dl") && /additional rewards/i.test(node.text())) {
      pastAdditionalMarker = true;
    } else if (node.is("ul")) {
      const target = pastAdditionalMarker ? postQuest : rewards;
      node.find("> li").each((_, el) => target.push(parseRewardListItem($, el)));
    }
    node = node.next();
  }

  return { rewards, postQuest, rewardBannerImage };
}
