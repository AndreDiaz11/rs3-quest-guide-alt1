import * as cheerio from "cheerio";

function parseLeadingAmount(text) {
  const match = text.match(/^([\d,]+)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

/**
 * A reward line can have its own indented sub-list (e.g. "Access to the
 * following areas:" -> Mogre Camp / Evil Chicken's Lair, or "Full access to
 * Culinaromancer's Chest" -> its own 4 sub-perks) — parsed out as `children`
 * (recursively, same shape) instead of being flattened into the parent's own
 * `display` text, matching the wiki's own nested list.
 */
function parseRewardListItem($, liEl) {
  const $li = $(liEl);
  const childUl = $li.children("ul").first();
  // A reward line can also embed its own reference screenshot inline (e.g.
  // The Elder Kiln's "2 quest points" li also contains a <figure> of the
  // Early Bird bonus screen) — strip it (and any nested sub-list, read
  // separately below) before reading text/links, or its caption ("The Early
  // Bird reward screen for...") gets appended onto the reward's own text,
  // and its own <a> could get mistaken for the reward's item link.
  const withoutChildren = $li.clone().children("ul").remove().end();
  withoutChildren.find("figure").remove();
  const text = withoutChildren.text().replace(/\s+/g, " ").trim();

  let result;
  if (/quest point/i.test(text)) {
    result = { type: "questPoints", amount: parseLeadingAmount(text) || 1, display: text };
  } else if (/experience/i.test(text)) {
    // The skill link's visible text is often just an icon (no text content),
    // so the skill name has to come from the link's `title` attribute.
    const skillLink = withoutChildren.find('a[href^="/w/"]').first();
    result = {
      type: "xp",
      skill: skillLink.attr("title") || skillLink.text().trim() || null,
      amount: parseLeadingAmount(text),
      display: text,
    };
  } else if (/^[\d,]+\s+coins?$/i.test(text)) {
    // Coin rewards render as plain text with no link at all (e.g. "500
    // coins"), so the item name would otherwise fall back to the literal
    // quantity-prefixed text and fail to resolve an image — "Coins" is the
    // real page.
    result = { type: "item", name: "Coins", display: text };
  } else {
    const itemLink = withoutChildren.find('a[href^="/w/"]').first();
    result = {
      type: "item",
      name: itemLink.attr("title") || itemLink.text().trim() || text,
      display: text,
    };
  }

  if (childUl.length > 0) {
    const children = [];
    childUl.children("li").each((_, childLi) => children.push(parseRewardListItem($, childLi)));
    result.children = children;
  }

  return result;
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
