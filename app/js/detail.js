import { meetsQuestRequirement, meetsSkillRequirement } from "./state.js";
import { getSkillIcon } from "./skillIcons.js";
import { t } from "./i18n.js";
import { questIcon, scrollIcon, giftIcon, unknownArrowIcon } from "./icons.js";

function localizedText(field, lang) {
  if (!field) return "";
  return field[lang] || field.en || "";
}

// Fairy ring teleport codes only ever use these 12 letters (two dials of six
// each), so matching runs made up of just these characters is safe — real
// words in guide text don't collide with this alphabet.
const FAIRY_CODE_RE = /\b([AIDKBCJLPQRS]{2,4})\b/g;

/** Finds valid fairy-ring-code spans in `text` (see appendFormattedStepText). */
function findFairyCodeSpans(text) {
  const spans = [];
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
    spans.push({ start: match.index, end: match.index + match[0].length, kind: "fairy-code", text: match[1] });
  }
  return spans;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds every occurrence of a highlighted name/term (NPCs, monsters, places,
 * items — anything that was a real [[wiki link]] in the source) in `text`.
 * Terms are matched longest-first so "TokHaar-Ket" doesn't shadow a longer
 * "TokHaar-Ket Champion" match starting at the same spot.
 */
function findHighlightSpans(text, terms) {
  if (!terms?.length) return [];
  const sorted = [...new Set(terms)].sort((a, b) => b.length - a.length);
  const re = new RegExp(sorted.map(escapeRegExp).join("|"), "gi");
  const spans = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length, kind: "highlight", text: match[0] });
  }
  return spans;
}

/**
 * Finds every occurrence of a wiki-bolded emphasis phrase (e.g. "If you
 * chose to kill Zanik", a progress counter "(1/8)", a single directional
 * word) in `text`. English-only by design — bold usage varies too much
 * (labels, single words, whole clauses) to reliably relocate in
 * already-translated Spanish text without a fresh, marker-preserving
 * translation pass, so the caller only passes terms for English text.
 */
function findBoldSpans(text, terms) {
  if (!terms?.length) return [];
  const sorted = [...new Set(terms)].sort((a, b) => b.length - a.length);
  const re = new RegExp(sorted.map(escapeRegExp).join("|"), "g");
  const spans = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length, kind: "bold-term", text: match[0] });
  }
  return spans;
}

/**
 * Appends `text` to `parent` as plain text, except for fairy-ring codes
 * (bolded, letter-spaced, matching the wiki's own stylized lettering),
 * highlighted names/terms (NPCs, monsters, places, items that were real wiki
 * links in the source, shown in a subtle blue accent, not a real hyperlink),
 * and wiki-bolded emphasis phrases (shown in a distinct amber accent,
 * English-only — see findBoldSpans).
 */
function appendFormattedStepText(parent, text, highlightTerms, boldTerms) {
  const spans = [
    ...findFairyCodeSpans(text),
    ...findHighlightSpans(text, highlightTerms),
    ...findBoldSpans(text, boldTerms),
  ].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end; // longer span first when they start at the same point
  });

  let lastIndex = 0;
  for (const span of spans) {
    if (span.start < lastIndex) continue; // overlaps a span already rendered — skip
    parent.appendChild(document.createTextNode(text.slice(lastIndex, span.start)));
    if (span.kind === "fairy-code") {
      parent.appendChild(el("b", { class: "fairy-code", text: span.text }));
    } else if (span.kind === "bold-term") {
      parent.appendChild(el("b", { class: "text-emphasis", text: span.text }));
    } else {
      parent.appendChild(el("span", { class: "term-highlight", text: span.text }));
    }
    lastIndex = span.end;
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

/**
 * Two or more solution/reference images the wiki placed directly next to
 * each other with nothing in between (e.g. Elemental Workshop III's
 * "before"/"after" puzzle pair) — rendered side by side in a row instead of
 * stacked as separate steps, matching how the wiki's own floated thumbnails
 * land next to each other.
 */
function renderStepImageGroup(step) {
  const wrap = el("div", { class: "step-image-group" });
  step.images.forEach((img) => wrap.appendChild(renderStepImage(img)));
  return wrap;
}

/** Renders one reward line and, recursively, its own indented sub-list (e.g. "Access to the following areas:" -> Mogre Camp / Evil Chicken's Lair) — matching the wiki's own nested list instead of flattening it into one line. */
function renderRewardRow(reward) {
  const li = el("li");
  const row = el("div", { class: "rewards-row" });
  if (reward.image) row.appendChild(el("img", { src: reward.image, alt: reward.name || "" }));
  row.appendChild(document.createTextNode(reward.display));
  li.appendChild(row);
  if (reward.children?.length) {
    const childUl = el("ul", { class: "rewards-list rewards-sublist" });
    reward.children.forEach((child) => childUl.appendChild(renderRewardRow(child)));
    li.appendChild(childUl);
  }
  return li;
}

/**
 * Renders a ✓/✗ marker for a requirement, matching the wiki's checklist
 * style. When the met/unmet status is unknown (no synced account), shows a
 * blue arrow icon instead of a bare "?" — a lone question mark read as just
 * a stray character rather than a real status indicator.
 */
function requirementMarker(met) {
  if (met === true) return el("span", { class: "req-met", text: "✓" });
  if (met === false) return el("span", { class: "req-unmet", text: "✗" });
  const span = el("span", { class: "req-unknown" });
  span.innerHTML = unknownArrowIcon("var(--quest-event)");
  return span;
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

/**
 * A collapsible `<details>` section with an icon + label `<summary>` —
 * closed by default. Ends with a "collapse" button so the reader can close
 * THIS section and jump back to its own top without scrolling, instead of
 * hunting for the summary again — it only affects this section, not the
 * other two.
 */
function renderSection(iconSvg, label, contentNodes) {
  const details = el("details", { class: "quest-section" });
  const summary = el("summary");
  summary.innerHTML = `<span class="quest-section-icon">${iconSvg}</span>`;
  summary.appendChild(document.createTextNode(label));
  details.appendChild(summary);
  contentNodes.forEach((node) => details.appendChild(node));

  const collapseBtn = el("button", { class: "collapse-all-btn", type: "button", text: t("collapseAll") });
  collapseBtn.addEventListener("click", () => {
    details.open = false;
    details.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  details.appendChild(collapseBtn);

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
  // Small inline icons the wiki shows right in the sentence (e.g. a mining
  // spot icon before a place name) — not embedded mid-text (word order shifts
  // across translation), shown as a compact icon group right before the
  // step's own text instead.
  if (step.icons?.length) {
    step.icons.forEach((icon) => {
      if (icon.image) wrap.appendChild(el("img", { class: "step-inline-icon", src: icon.image, alt: "" }));
    });
  }
  // Bold-emphasis highlighting only applies to English text — see
  // findBoldSpans for why it can't reliably relocate in translated Spanish.
  // Checked against what's actually displayed (not just the app's language
  // setting), since a step missing its Spanish translation falls back to
  // showing English anyway.
  const actuallyShowingEnglish = lang === "en" || !step.text?.[lang];
  const boldTerms = actuallyShowingEnglish ? step.boldTerms : null;
  appendFormattedStepText(wrap, localizedText(step.text, lang), step.highlightTerms, boldTerms);
  if (step.chatOptions?.length) {
    wrap.appendChild(renderChatOptionsSummary(step.chatOptions));
  }
  return wrap;
}

function selectableListKey(questId, stepIndex) {
  return `selectableList:${questId}:${stepIndex}`;
}

function loadSelectableSelection(questId, stepIndex) {
  try {
    const raw = localStorage.getItem(selectableListKey(questId, stepIndex));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSelectableSelection(questId, stepIndex, selectedSet) {
  localStorage.setItem(selectableListKey(questId, stepIndex), JSON.stringify([...selectedSet]));
}

/**
 * Renders the wiki's `{{Needed|...}}`/`{{Needed|recommended=...}}` note (e.g.
 * Pieces of Hate's "Needed: 3 pieces of pirate clothing") as a small,
 * slightly-highlighted box above the section's steps — italic body text,
 * bold label, linked names in the same blue used everywhere else.
 */
function renderSectionNote(step, lang) {
  const box = el("div", { class: "section-note" });
  const addLine = (labelKey, note) => {
    const line = el("div", { class: "section-note-line" });
    line.appendChild(el("b", { text: t(labelKey) }));
    line.appendChild(document.createTextNode(": "));
    appendFormattedStepText(line, localizedText(note.text, lang), note.highlightTerms, null);
    box.appendChild(line);
  };
  if (step.needed) addLine("neededLabel", step.needed);
  if (step.recommended) addLine("recommendedLabel", step.recommended);
  return box;
}

/**
 * Renders the wiki's own "select which of these to mark done" widget (e.g.
 * The Mighty Fall's "talk to the following goblins", each with its own chat
 * options) — a bordered list where clicking a row toggles a done/selected
 * look, with a "Clear selection" reset at the bottom, matching the wiki
 * exactly instead of forcing these into the sequential checklist above it
 * (they aren't sequential — you only do ONE, or the wiki wouldn't need a
 * "select" widget for them at all).
 */
function renderSelectableList(quest, step, lang) {
  const selected = loadSelectableSelection(quest.id, step.index);
  const wrap = el("div", { class: "selectable-list" });
  const rows = [];

  const clearBtn = el("button", { class: "selectable-list-clear", type: "button" });
  const updateClearBtn = () => {
    clearBtn.textContent = t("clearSelection", selected.size, step.items.length);
  };

  step.items.forEach((item, i) => {
    const row = el("div", { class: `selectable-list-item${selected.has(i) ? " selected" : ""}` });
    row.appendChild(renderStepContent(item, lang));
    row.addEventListener("click", (e) => {
      // Clicking the chat-options "..." button should open the popup, not toggle selection.
      if (e.target.closest(".chat-options-more")) return;
      if (selected.has(i)) selected.delete(i);
      else selected.add(i);
      row.classList.toggle("selected", selected.has(i));
      saveSelectableSelection(quest.id, step.index, selected);
      updateClearBtn();
    });
    wrap.appendChild(row);
    rows.push(row);
  });

  updateClearBtn();
  clearBtn.addEventListener("click", () => {
    selected.clear();
    rows.forEach((row) => row.classList.remove("selected"));
    saveSelectableSelection(quest.id, step.index, selected);
    updateClearBtn();
  });
  wrap.appendChild(clearBtn);

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
/**
 * Builds the full body for one quest (header, banners, infobox, Overview,
 * Steps, [Sub-misiones], Rewards) as a plain array of DOM nodes — used both
 * for the top-level quest being viewed and, nested inside a collapsible
 * block, for each sub-quest of a hub quest. `sticky` controls whether the
 * header pins to the top of its scroll container — only meaningful for the
 * true top-level quest, since a nested sub-quest block scrolls inside the
 * page normally. `extraSectionAfterSteps` (a hub's own "Sub-misiones"
 * section) is inserted right after Steps and before Rewards, matching the
 * wiki's own Overview -> Steps -> Sub-quests -> Rewards order.
 */
function buildQuestBody(quest, lang, isCompleted, { sticky = true, extraSectionAfterSteps = null } = {}) {
  const nodes = [];
  const manualChecks = loadManualChecks(quest.id);

  const header = el("div", { class: sticky ? "quest-header quest-header-sticky" : "quest-header" });
  if (quest.icon) header.appendChild(el("img", { src: quest.icon, alt: "" }));
  header.appendChild(el("h1", { text: quest.title }));
  nodes.push(header);

  if (quest.isSeasonal) {
    nodes.push(
      el("div", {
        class: "seasonal-banner",
        text: t("seasonalBanner"),
      })
    );
  }

  if (quest.removedDate) {
    nodes.push(
      el("div", {
        class: "removed-content-banner",
        text: t("removedContentBanner", quest.removedDate),
      })
    );
  }

  nodes.push(
    el("div", {
      class: "quest-meta-updated",
      text: t("guideUpdated", new Date(quest.guideLastUpdated).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES")),
    })
  );

  // The wiki's own infobox card — always visible (not collapsible), English
  // exactly as the wiki shows it, no new translation cost.
  nodes.push(renderWikiInfobox(quest));

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
    nodes.push(renderSection(questIcon("var(--gold)"), t("sectionOverview"), overviewNodes));
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

        // Two+ solution images the wiki placed right next to each other
        // (e.g. a puzzle's "before"/"after" pair) — shown side by side.
        if (step.isImageGroup) {
          const li = el("li", { class: "step-image-li" });
          li.appendChild(renderStepImageGroup(step));
          stepList.appendChild(li);
          return;
        }

        // A "select which of these to mark done" widget (e.g. The Mighty
        // Fall's "talk to the following goblins") — the wiki shows this as
        // its own clickable list separate from the sequential checklist,
        // not a normal checkbox step.
        if (step.isSelectableList) {
          const li = el("li", { class: "selectable-list-li" });
          li.appendChild(renderSelectableList(quest, step, lang));
          stepList.appendChild(li);
          return;
        }

        // {{Needed|...}}/{{Needed|recommended=...}} — a short prerequisite/tip
        // note the wiki shows before a section's steps (e.g. Pieces of Hate's
        // "Needed: 3 pieces of pirate clothing"), not an actionable step.
        if (step.isSectionNote) {
          const li = el("li", { class: "section-note-li" });
          li.appendChild(renderSectionNote(step, lang));
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
    nodes.push(renderSection(scrollIcon("var(--gold)"), t("sectionSteps"), stepsNodes));
  }

  if (extraSectionAfterSteps) nodes.push(...[extraSectionAfterSteps].flat().filter(Boolean));

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
    nodes.push(renderSection(giftIcon("var(--gold)"), t("sectionRewards"), rewardsNodes));
  }

  return nodes;
}

/**
 * One sub-quest of a hub quest (Recipe for Disaster, Dimension of Disaster,
 * Once Upon a Time in Gielinor, That Old Black Magic), rendered as its own
 * collapsible block with the SAME full content a normal quest gets (meta,
 * requirements, items, steps, rewards) — nested directly inside the hub's
 * page rather than requiring navigation away from it. `subquestEntry` is
 * `{ id, quest }` (the sub-quest's own full per-quest data, already fetched
 * by main.js before calling renderQuestDetail).
 */
function renderSubquestBlock(subquestEntry, lang) {
  const { quest, status, isCompleted } = subquestEntry;
  const details = el("details", { class: "subquest-block" });
  const statusClass = `status-${(status || "NOT_STARTED").toLowerCase().replace("_", "-")}`;
  const summary = el("summary", { class: `subquest-summary ${statusClass}` });
  summary.appendChild(document.createTextNode(quest.title));
  details.appendChild(summary);
  buildQuestBody(quest, lang, isCompleted, { sticky: false }).forEach((node) => details.appendChild(node));
  return details;
}

/**
 * Renders the right-panel quest detail into `container`. `isCompleted`
 * (from RuneMetrics, wired in M2) forces every step checked and read-only;
 * otherwise steps use manual localStorage-backed checkboxes. Layout follows
 * the wiki's own Quick guide structure: header -> meta -> requirements (with
 * ✓/✗ against the real account) -> items (chips + list) -> steps grouped
 * under their wiki section headings (English titles, no new translation
 * cost) -> rewards at the bottom with the wiki's banner image. A hub quest
 * (e.g. Recipe for Disaster) additionally gets a "Sub-misiones" section with
 * each real sub-quest's full guide nested inside its own collapsible block —
 * see `subquests` (an array of `{ id, quest, isCompleted }`, resolved and
 * fetched by main.js from `quest.subquests`' wiki titles).
 */
export function renderQuestDetail(
  container,
  quest,
  { lang = "en", isCompleted = false, subquests = [], bonusQuests = [] } = {}
) {
  container.innerHTML = "";
  const subquestsSection =
    subquests.length > 0
      ? renderSection(
          questIcon("var(--gold)"),
          t("sectionSubquests"),
          subquests.map((entry) => renderSubquestBlock(entry, lang))
        )
      : null;
  // Genuinely separate quest pages a hub links to OUTSIDE its selectable
  // sub-quest grid — e.g. Recipe for Disaster's own linear intro ("Another
  // Cook's Quest") and automatic finale ("Defeating the Culinaromancer").
  // Real client's info panel doesn't show these as one of the hub's icons,
  // so they get their own section instead of inflating the sub-quest count.
  const bonusQuestsSection =
    bonusQuests.length > 0
      ? renderSection(
          questIcon("var(--gold)"),
          t("sectionBonusQuests"),
          bonusQuests.map((entry) => renderSubquestBlock(entry, lang))
        )
      : null;
  buildQuestBody(quest, lang, isCompleted, {
    sticky: true,
    extraSectionAfterSteps: [subquestsSection, bonusQuestsSection],
  }).forEach((node) => container.appendChild(node));
}
