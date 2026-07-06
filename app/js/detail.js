import { meetsQuestRequirement, meetsSkillRequirement } from "./state.js";
import { getSkillIcon } from "./skillIcons.js";
import { t } from "./i18n.js";
import { questIcon, scrollIcon, giftIcon } from "./icons.js";

function localizedText(field, lang) {
  if (!field) return "";
  return field[lang] || field.en || "";
}

// Fairy ring teleport codes only ever use these 12 letters (two dials of six
// each), so matching runs made up of just these characters is safe — real
// words in guide text don't collide with this alphabet.
const FAIRY_CODE_RE = /\b([AIDKBCJLPQRS]{2,4})\b/g;

/**
 * Appends `text` to `parent`, rendering fairy ring codes (e.g. "DKQ") in bold
 * with letter-spacing so they stand out like the wiki's own stylized
 * lettering, instead of blending into the sentence as plain text.
 */
function appendTextWithFairyCodes(parent, text) {
  let lastIndex = 0;
  let match;
  FAIRY_CODE_RE.lastIndex = 0;
  while ((match = FAIRY_CODE_RE.exec(text)) !== null) {
    // Only treat it as a fairy ring code next to "fairy ring"/"anillo de
    // hadas" (optionally followed by "code"/"código:") or right at the start
    // of the step followed by a comma — avoids bolding an unrelated all-caps
    // word that happens to use these letters.
    const before = text.slice(Math.max(0, match.index - 30), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 2);
    const nearFairyRing =
      /(?:fairy ring|fairy code|anillo de (?:las? )?hadas|c[íi]rculo de hadas|c[óo]digo de (?:hadas|c[íi]rculo de hadas))(?:\s+code|\s+c[óo]digo)?\s*:?\s*$|\bdial\s*$|\bmarca\s*$/i.test(
        before
      );
    const atStart = match.index === 0 && after.startsWith(",");
    if (!nearFairyRing && !atStart) continue;

    parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    parent.appendChild(el("b", { class: "fairy-code", text: match[1] }));
    lastIndex = match.index + match[0].length;
  }
  parent.appendChild(document.createTextNode(text.slice(lastIndex)));
}

function manualChecksKey(questId) {
  return `manualChecks:${questId}`;
}

function loadManualChecks(questId) {
  try {
    const raw = localStorage.getItem(manualChecksKey(questId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveManualChecks(questId, checkedSet) {
  localStorage.setItem(manualChecksKey(questId), JSON.stringify([...checkedSet]));
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

/** Renders a wiki quiz/solution table (e.g. "Question"/"Answer" pairs) as a plain HTML table. */
function renderStepTable(table) {
  const wrap = el("table", { class: "step-table" });
  if (table.headers) {
    const thead = el("thead");
    const tr = el("tr");
    table.headers.forEach((h) => tr.appendChild(el("th", { text: h })));
    thead.appendChild(tr);
    wrap.appendChild(thead);
  }
  const tbody = el("tbody");
  table.rows.forEach((row) => {
    const tr = el("tr");
    row.forEach((cell) => tr.appendChild(el("td", { text: cell })));
    tbody.appendChild(tr);
  });
  wrap.appendChild(tbody);
  return wrap;
}

/**
 * Renders one required-item node and, recursively, its own indented caveats
 * underneath (e.g. The Elder Kiln's "Melee, magic or ranged armour..." with
 * "Necromancy does not work...", "A dwarf multicannon is not allowed...",
 * etc. nested one level in) — matching the wiki's own indented tree instead
 * of flattening every note into its own unrelated top-level item.
 */
function renderItemRow(item) {
  const li = el("li");
  const row = el("div", { class: "items-plain-row" });
  if (item.image) row.appendChild(el("img", { src: item.image, alt: item.name }));
  row.appendChild(document.createTextNode(item.display || item.name));
  li.appendChild(row);
  if (item.children?.length) {
    const childUl = el("ul", { class: "items-plain-list items-plain-sublist" });
    item.children.forEach((child) => childUl.appendChild(renderItemRow(child)));
    li.appendChild(childUl);
  }
  return li;
}

/** Opens a fullscreen lightbox showing `src` at full size; closes on click anywhere or the ✕. */
function openImageLightbox(src) {
  const overlay = el("div", { class: "lightbox-overlay" });
  const img = el("img", { class: "lightbox-image", src, alt: "" });
  const close = el("button", { class: "lightbox-close", type: "button", text: "✕" });
  overlay.appendChild(img);
  overlay.appendChild(close);

  const closeLightbox = () => {
    if (document.fullscreenElement === overlay) document.exitFullscreen?.().catch(() => {});
    overlay.remove();
  };
  overlay.addEventListener("click", closeLightbox);
  close.addEventListener("click", closeLightbox);

  document.body.appendChild(overlay);
  // Try to use the actual OS-level fullscreen (bigger than the plugin's own
  // window) so reward art can be read up close; some Alt1/CEF builds don't
  // support it, so silently fall back to the in-app overlay if it's refused.
  overlay.requestFullscreen?.().catch(() => {});
}

/** The wiki's reward banner image, shown as a thumbnail with a zoom button that opens it fullscreen. */
function renderRewardBanner(src) {
  const wrap = el("div", { class: "reward-banner-wrap" });
  const img = el("img", { class: "reward-banner", src, alt: "" });
  const zoomBtn = el("button", { class: "reward-banner-zoom", type: "button", title: t("zoomImage"), text: "🔍" });
  zoomBtn.addEventListener("click", () => openImageLightbox(src));
  wrap.appendChild(img);
  wrap.appendChild(zoomBtn);
  wrap.addEventListener("click", () => openImageLightbox(src));
  return wrap;
}

/** A wiki solution/puzzle screenshot (e.g. Hero's Welcome's "The fully completed map") next to the step it illustrates, with the same zoom-to-fullscreen lupa as the reward banner. */
function renderStepImage(step) {
  const wrap = el("div", { class: "step-image-wrap" });
  if (step.image) {
    const img = el("img", { class: "step-image", src: step.image, alt: step.caption || "" });
    const zoomBtn = el("button", { class: "step-image-zoom", type: "button", title: t("zoomImage"), text: "🔍" });
    zoomBtn.addEventListener("click", () => openImageLightbox(step.image));
    wrap.appendChild(img);
    wrap.appendChild(zoomBtn);
    wrap.addEventListener("click", () => openImageLightbox(step.image));
  }
  if (step.caption) wrap.appendChild(el("div", { class: "step-image-caption", text: step.caption }));
  return wrap;
}

function renderRewardRow(reward) {
  const li = el("li");
  if (reward.image) li.appendChild(el("img", { src: reward.image, alt: reward.name || "" }));
  li.appendChild(document.createTextNode(reward.display));
  return li;
}

/** Renders a ✓/✗/? marker for a requirement, matching the wiki's checklist style. */
function requirementMarker(met) {
  if (met === true) return el("span", { class: "req-met", text: "✓" });
  if (met === false) return el("span", { class: "req-unmet", text: "✗" });
  return el("span", { class: "req-unknown", text: "?" });
}

/**
 * Renders one quest-requirement node and, recursively, its own prerequisites
 * underneath it staggered one step further right — matching the wiki's own
 * indented requirement tree (e.g. Children of Mah -> The Light Within ->
 * Meeting History / The Temple at Senntisten / ...).
 */
function renderRequirementNode(node) {
  const li = el("li");
  li.appendChild(requirementMarker(meetsQuestRequirement(node.matchTitle || node.title)));
  li.appendChild(document.createTextNode(" " + node.title));
  if (node.children?.length) {
    const childUl = el("ul", { class: "requirement-tree" });
    node.children.forEach((child) => childUl.appendChild(renderRequirementNode(child)));
    li.appendChild(childUl);
  }
  return li;
}

function renderRequirementsList(quest) {
  const wrap = el("div", { class: "requirements-list" });

  const skills = quest.requirements?.skills || [];
  const quests = quest.requirements?.quests || [];
  if (skills.length === 0 && quests.length === 0) return null;

  if (quests.length > 0) {
    const ul = el("ul", { class: "requirement-tree" });
    quests.forEach((node) => ul.appendChild(renderRequirementNode(node)));
    wrap.appendChild(ul);
  }

  if (skills.length > 0) {
    const ul = el("ul", { class: `requirement-items${quests.length > 0 ? " requirement-skills-gap" : ""}` });
    skills.forEach((req) => {
      const li = el("li");
      li.appendChild(requirementMarker(meetsSkillRequirement(req)));
      const icon = getSkillIcon(req.skill);
      if (icon) li.appendChild(el("img", { class: "req-skill-icon", src: icon, alt: req.skill }));
      li.appendChild(document.createTextNode(` ${req.skill} ${req.level}`));
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  }

  return wrap;
}

/** Renders one "Follows events" (recommended-but-not-required) quest node — same tree shape as Requirements, just without a ✓/✗ marker since it's optional. */
function renderFollowsEventNode(node) {
  const li = el("li", { text: node.title });
  if (node.children?.length) {
    const childUl = el("ul", { class: "requirement-tree" });
    node.children.forEach((child) => childUl.appendChild(renderFollowsEventNode(child)));
    li.appendChild(childUl);
  }
  return li;
}

const AGE_ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];
/** Matches the wiki's own infobox phrasing: numeric ages ("5") become "Fifth Age"; free-text ones ("ambiguous") just get capitalized. */
function formatAge(age) {
  if (!age) return null;
  const n = Number(age);
  if (Number.isInteger(n) && n >= 1 && n <= AGE_ORDINALS.length) return `${AGE_ORDINALS[n - 1]} Age`;
  return age.charAt(0).toUpperCase() + age.slice(1);
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * The wiki's own infobox card (Release date, Members, Voice Over, Official
 * series, Age, Timeline, Start area, Combat, Entity icon) — deliberately
 * left in English exactly as the wiki shows it, no new translation cost,
 * always visible (not collapsible) right below the quest title.
 */
function renderWikiInfobox(quest) {
  const grid = el("dl", { class: "wiki-infobox" });
  const addRow = (label, valueNode) => {
    if (!valueNode) return;
    grid.appendChild(el("dt", { text: label }));
    const dd = el("dd");
    if (typeof valueNode === "string") dd.textContent = valueNode;
    else dd.appendChild(valueNode);
    grid.appendChild(dd);
  };

  addRow("Release date", quest.releaseDate);
  addRow("Members", quest.members ? "Yes" : "No");
  addRow("Voice Over", quest.voiceOver ? "Yes" : "No");
  addRow("Official series", quest.series ? `${quest.series}${quest.seriesNth ? ` #${quest.seriesNth}` : ""}` : null);
  addRow("Age", formatAge(quest.age));
  addRow("Timeline", capitalize(quest.timeline));
  addRow("Start area", quest.area);
  addRow("Combat", quest.combatLevel ? `NPC combat level ${quest.combatLevel}` : null);
  if (quest.entityIcon) addRow("Entity icon", el("img", { class: "wiki-infobox-icon", src: quest.entityIcon, alt: "" }));

  return grid;
}

/** A collapsible `<details>` section with an icon + label `<summary>` — closed by default. */
function renderSection(iconSvg, label, contentNodes) {
  const details = el("details", { class: "quest-section" });
  const summary = el("summary");
  summary.innerHTML = `<span class="quest-section-icon">${iconSvg}</span>`;
  summary.appendChild(document.createTextNode(label));
  details.appendChild(summary);
  contentNodes.forEach((node) => details.appendChild(node));
  return details;
}

/** Extracts just the marker shown inline next to the chat bubble (e.g. "1", "#", "~" for "Any"). */
function chatOptionMarker(opt) {
  const match = opt.match(/^([#?\d]+)\s+/);
  if (match) return match[1];
  const lower = opt.trim().toLowerCase();
  if (lower === "any") return "~";
  if (lower === "accept") return "✓";
  // Options with no leading marker at all (e.g. "Yes.") use "?" like the
  // other undetermined-position markers — using "•" here collided visually
  // with the "•" that joins markers together (e.g. "1•••5" instead of a
  // single clean separator).
  return "?";
}

/**
 * A popup line matching the wiki's own plain style: bold marker (no period),
 * plain dialogue text (no quotes/italics) — the previous quoted-italic look
 * didn't match the wiki at all.
 */
function renderChatOptionLine(opt) {
  const li = el("li");
  const match = opt.match(/^([#?\d]+)\s+(.+)$/);
  const lower = opt.trim().toLowerCase();
  if (match) {
    const [, marker, dialogue] = match;
    li.appendChild(el("span", { class: "chat-opt-num", text: marker }));
    li.appendChild(document.createTextNode(" " + dialogue));
  } else if (lower === "any") {
    // Matches the wiki's own literal "~ [Any option]" notation.
    li.appendChild(el("span", { class: "chat-opt-num", text: "~" }));
    li.appendChild(document.createTextNode(" [Any option]"));
  } else if (lower === "accept") {
    li.appendChild(el("span", { class: "chat-opt-num", text: "✓" }));
    li.appendChild(document.createTextNode(" [Accept Quest]"));
  } else {
    li.appendChild(document.createTextNode(opt));
  }
  return li;
}

function openChatOptionsPopup(anchorEl, options) {
  const existing = document.querySelector(".chat-options-popup");
  existing?.remove();
  if (existing && existing.dataset.forBtn === anchorEl.dataset.chatBtnId) return; // clicking the same anchor again just closes it

  const popup = el("div", { class: "chat-options-popup" });
  const list = el("ul");
  options.forEach((opt) => list.appendChild(renderChatOptionLine(opt)));
  popup.appendChild(list);
  const close = el("button", { class: "chat-options-close", type: "button", text: "✕" });
  close.addEventListener("click", () => popup.remove());
  popup.appendChild(close);

  const btnId = String(Date.now());
  anchorEl.dataset.chatBtnId = btnId;
  popup.dataset.forBtn = btnId;

  document.body.appendChild(popup);
  const rect = anchorEl.getBoundingClientRect();
  const maxLeft = window.innerWidth - popup.offsetWidth - 8;
  popup.style.top = `${rect.bottom + 6}px`;
  popup.style.left = `${Math.min(rect.left, maxLeft)}px`;
}

/**
 * Renders the wiki's own inline chat-options summary right after the step's
 * sentence: "(💬 1•2•1•3•1) ..." — a chat bubble + each option's marker
 * joined by "•", followed by a small "..." button that opens the full popup.
 */
function renderChatOptionsSummary(options) {
  const wrap = el("span", { class: "chat-options-summary" });
  wrap.appendChild(el("span", { class: "chat-options-icon", text: "💬" }));
  wrap.appendChild(document.createTextNode(" " + options.map(chatOptionMarker).join("•")));

  const more = el("button", { class: "chat-options-more", type: "button", title: t("chatOptionsTitle"), text: "..." });
  more.addEventListener("click", () => openChatOptionsPopup(more, options));

  const outer = el("span", { class: "chat-options-inline" });
  outer.appendChild(document.createTextNode("("));
  outer.appendChild(wrap);
  outer.appendChild(document.createTextNode(")"));
  outer.appendChild(document.createTextNode(" "));
  outer.appendChild(more);
  return outer;
}

/**
 * Renders a step's text and (if any) its inline chat-options summary as ONE
 * wrapping unit. They must be siblings inside a single non-flex container —
 * putting them as separate flex-item siblings of the parent `<li>` (flex,
 * for the checkbox) made the chat marker sit beside the FIRST line of a
 * wrapped multi-line sentence instead of flowing after its last word.
 */
function renderStepContent(step, lang) {
  const wrap = el("span", { class: "step-text" });
  appendTextWithFairyCodes(wrap, localizedText(step.text, lang));
  if (step.chatOptions?.length) {
    wrap.appendChild(renderChatOptionsSummary(step.chatOptions));
  }
  return wrap;
}

/**
 * Renders the right-panel quest detail into `container`. `isCompleted`
 * (from RuneMetrics, wired in M2) forces every step checked and read-only;
 * otherwise steps use manual localStorage-backed checkboxes. Layout follows
 * the wiki's own Quick guide structure: header -> meta -> requirements (with
 * ✓/✗ against the real account) -> items (chips + list) -> steps grouped
 * under their wiki section headings (English titles, no new translation
 * cost) -> rewards at the bottom with the wiki's banner image.
 */
export function renderQuestDetail(container, quest, { lang = "en", isCompleted = false } = {}) {
  container.innerHTML = "";
  const manualChecks = loadManualChecks(quest.id);

  // Sticky (position: sticky in CSS) so the quest's icon+name stays visible
  // at the top of the panel while scrolling through Overview/Steps/Rewards.
  const header = el("div", { class: "quest-header quest-header-sticky" });
  if (quest.icon) header.appendChild(el("img", { src: quest.icon, alt: "" }));
  header.appendChild(el("h1", { text: quest.title }));
  container.appendChild(header);

  if (quest.isSeasonal) {
    container.appendChild(
      el("div", {
        class: "seasonal-banner",
        text: t("seasonalBanner"),
      })
    );
  }

  if (quest.removedDate) {
    container.appendChild(
      el("div", {
        class: "removed-content-banner",
        text: t("removedContentBanner", quest.removedDate),
      })
    );
  }

  container.appendChild(
    el("div", {
      class: "quest-meta-updated",
      text: t("guideUpdated", new Date(quest.guideLastUpdated).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES")),
    })
  );

  // The wiki's own infobox card — always visible (not collapsible), English
  // exactly as the wiki shows it, no new translation cost.
  container.appendChild(renderWikiInfobox(quest));

  // --- "Overview" (Resumen): everything before the walkthrough — start
  // point, length, requirements, follows events, items, recommended, combat.
  const overviewNodes = [];
  const metaGrid = el("dl", { class: "quest-meta-grid" });
  const addMeta = (label, value) => {
    if (!value) return;
    metaGrid.appendChild(el("dt", { text: label }));
    metaGrid.appendChild(el("dd", { text: value }));
  };
  addMeta(t("metaStartPoint"), localizedText(quest.startPoint, lang));
  addMeta(t("metaLength"), quest.length);
  if (metaGrid.children.length > 0) overviewNodes.push(metaGrid);

  const requirementsList = renderRequirementsList(quest);
  if (requirementsList) {
    overviewNodes.push(el("h3", { class: "subsection-title", text: t("sectionRequirements") }));
    overviewNodes.push(requirementsList);
  }

  if (quest.followsEvents?.length) {
    overviewNodes.push(el("h3", { class: "subsection-title", text: t("sectionFollowsEvents") }));
    const ul = el("ul", { class: "requirement-tree" });
    quest.followsEvents.forEach((node) => ul.appendChild(renderFollowsEventNode(node)));
    overviewNodes.push(ul);
  }

  if (quest.items?.length) {
    overviewNodes.push(el("h3", { class: "subsection-title", text: t("sectionItems") }));
    const itemsList = el("ul", { class: "items-plain-list" });
    quest.items.forEach((item) => itemsList.appendChild(renderItemRow(item)));
    overviewNodes.push(itemsList);
  }

  if (quest.recommended?.length) {
    overviewNodes.push(el("h3", { class: "subsection-title", text: t("sectionRecommended") }));
    const recList = el("ul", { class: "items-plain-list" });
    quest.recommended.forEach((item) => recList.appendChild(renderItemRow(item)));
    overviewNodes.push(recList);
  }

  if (quest.kills?.length) {
    overviewNodes.push(el("h3", { class: "subsection-title", text: t("sectionCombat") }));
    const killsList = el("ul", { class: "postquest-list" });
    quest.kills.forEach((entry) => killsList.appendChild(el("li", { text: entry })));
    overviewNodes.push(killsList);
  }

  if (overviewNodes.length > 0) {
    container.appendChild(renderSection(questIcon("var(--gold)"), t("sectionOverview"), overviewNodes));
  }

  // --- "Guía paso a paso" (Step-by-step guide): the walkthrough itself.
  const stepsNodes = [];
  if (quest.guideNote) {
    stepsNodes.push(el("div", { class: "guide-note", text: localizedText(quest.guideNote, lang) }));
  }

  if (quest.steps?.length) {
    // Group consecutive steps by their wiki section heading (English on
    // purpose, no new translation cost — see scraper/src/migrate.js).
    const sections = [];
    for (const step of quest.steps) {
      const last = sections[sections.length - 1];
      if (last && last.heading === step.section) last.steps.push(step);
      else sections.push({ heading: step.section, steps: [step] });
    }

    const rows = [];
    sections.forEach((section) => {
      if (section.heading) {
        stepsNodes.push(el("h3", { class: "step-section-title", text: section.heading }));
      }
      const stepList = el("ul", { class: "step-list" });
      section.steps.forEach((step) => {
        // A quiz/solution wikitable (e.g. Hero's Welcome's Question/Answer
        // table) — reference info, not an action, so no checkbox either.
        if (step.isTable) {
          const li = el("li", { class: "step-table-wrap" });
          li.appendChild(renderStepTable(step.table));
          stepList.appendChild(li);
          return;
        }

        // A standalone solution/puzzle screenshot (e.g. Hero's Welcome's "The
        // fully completed map") — reference info, not an action either.
        if (step.isImage) {
          const li = el("li", { class: "step-image-li" });
          li.appendChild(renderStepImage(step));
          stepList.appendChild(li);
          return;
        }

        // "*: " notes from the wiki (e.g. "If done correctly, you receive a
        // wrinkly scroll.") are informational, not an actual action to take —
        // shown without a checkbox, matching how the wiki itself displays them.
        if (step.isNote) {
          const li = el("li", { class: `step-note indent-${step.indent}` });
          li.appendChild(renderStepContent(step, lang));
          stepList.appendChild(li);
          return;
        }

        const checked = isCompleted || manualChecks.has(step.index);
        const li = el("li", { class: `indent-${step.indent}${checked ? " checked" : ""}` });
        const checkbox = el("input", { type: "checkbox" });
        checkbox.checked = checked;
        checkbox.disabled = isCompleted;
        li.appendChild(checkbox);
        li.appendChild(renderStepContent(step, lang));
        stepList.appendChild(li);
        rows.push({ step, li, checkbox });
      });
      stepsNodes.push(stepList);
    });

    const setChecked = (row, value) => {
      row.checkbox.checked = value;
      row.li.classList.toggle("checked", value);
      if (value) manualChecks.add(row.step.index);
      else manualChecks.delete(row.step.index);
    };

    // Finds the nearest preceding row with a strictly lower indent (its
    // parent step), or -1 if this row is already top-level.
    const getParentIndex = (i) => {
      const indent = rows[i].step.indent;
      for (let j = i - 1; j >= 0; j--) {
        if (rows[j].step.indent < indent) return j;
      }
      return -1;
    };

    // Direct children only (indent exactly one deeper), not every descendant —
    // that's what decides whether a parent counts as "fully done".
    const getDirectChildIndexes = (parentIdx) => {
      const indent = rows[parentIdx].step.indent;
      const children = [];
      for (let j = parentIdx + 1; j < rows.length && rows[j].step.indent > indent; j++) {
        if (rows[j].step.indent === indent + 1) children.push(j);
      }
      return children;
    };

    rows.forEach((row, i) => {
      row.checkbox.addEventListener("change", () => {
        setChecked(row, row.checkbox.checked);
        // Marcar un paso principal también marca sus sub-pasos/opcionales
        // (los que siguen con más sangría), ya que implica que ese paso completo
        // ya se hizo. No se desmarcan solos al destildar el principal.
        if (row.checkbox.checked && row.step.indent === 0) {
          for (let j = i + 1; j < rows.length && rows[j].step.indent > 0; j++) {
            setChecked(rows[j], true);
          }
        }

        // Bubble upward: a parent step auto-checks the instant every one of
        // its direct sub-steps is checked, and auto-unchecks the instant any
        // of them isn't — climbs through every ancestor level, not just one.
        let current = i;
        while (true) {
          const parentIdx = getParentIndex(current);
          if (parentIdx === -1) break;
          const childIdxs = getDirectChildIndexes(parentIdx);
          const allChecked = childIdxs.every((ci) => rows[ci].checkbox.checked);
          setChecked(rows[parentIdx], allChecked);
          current = parentIdx;
        }

        saveManualChecks(quest.id, manualChecks);
      });
    });
  }

  if (stepsNodes.length > 0) {
    container.appendChild(renderSection(scrollIcon("var(--gold)"), t("sectionSteps"), stepsNodes));
  }

  // --- "Recompensas" (Rewards): reward banner, grouped reward list, and any
  // additional (manual-claim) rewards.
  const rewardsNodes = [];
  if (quest.rewards?.length) {
    if (quest.rewardBannerImage) {
      rewardsNodes.push(renderRewardBanner(quest.rewardBannerImage));
    }
    // Some quests mix plain items/xp with a distinct wiki subgroup (e.g.
    // "Music unlocked", "Early bird bonus") — group consecutive rewards by
    // that label into their own <ul> with an (English, no-cost) subheading,
    // matching how the wiki visually separates them, instead of dumping
    // everything into one flat list.
    const groups = [];
    quest.rewards.forEach((reward) => {
      const last = groups[groups.length - 1];
      if (last && last.group === (reward.group || null)) last.items.push(reward);
      else groups.push({ group: reward.group || null, items: [reward] });
    });
    groups.forEach(({ group, items }) => {
      if (group) rewardsNodes.push(el("h3", { class: "step-section-title", text: group }));
      const rewardsList = el("ul", { class: "rewards-list" });
      items.forEach((reward) => rewardsList.appendChild(renderRewardRow(reward)));
      rewardsNodes.push(rewardsList);
    });
  }

  if (quest.postQuest?.length) {
    rewardsNodes.push(el("h3", { class: "subsection-title", text: t("sectionPostQuest") }));
    const list = el("ul", { class: "postquest-list" });
    quest.postQuest.forEach((entry) => list.appendChild(el("li", { text: entry.display })));
    rewardsNodes.push(list);
  }

  if (rewardsNodes.length > 0) {
    container.appendChild(renderSection(giftIcon("var(--gold)"), t("sectionRewards"), rewardsNodes));
  }
}
