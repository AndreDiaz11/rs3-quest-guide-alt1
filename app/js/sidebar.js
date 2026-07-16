import { state, questStatus, isSynced } from "./state.js";
import { t } from "./i18n.js";
import { compassIcon, funnelIcon } from "./icons.js";

// No public API can tell us whether a quest's non-quest/non-skill
// requirements (a minigame or activity achievement, e.g. Nomad's Requiem's
// "Complete the Knight Waves in Camelot") are actually met — confirmed even
// the wiki's own quest-requirement checker has this exact same gap. Rather
// than show a guessed, sometimes-wrong "Locked" status, there's no separate
// Locked bucket at all: a type checkbox (Quest/Miniquest) shows everything
// of that type that isn't completed, whether truly available or not.
function filterQuests(quests) {
  const { showQuest, showMiniquest, showCompleted } = state.activeFilters;
  const typeVisible = { quest: showQuest, miniquest: showMiniquest };
  return quests.filter((q) => {
    // Matches the real client's panel exactly: non-canonical entries
    // (tutorials/lore/saga sub-chapters) and currently-existing seasonal
    // quests never appear in RS3's own quest list at all, not just its count.
    if (!isRs3Countable(q)) return false;
    if (!typeVisible[q.isMiniquest ? "miniquest" : "quest"]) return false;
    if (questStatus(q.id) === "COMPLETED") return showCompleted;
    return true;
  });
}

// RS3's own ordinal scale for length isn't exposed anywhere machine-readable
// — built from what's actually present across the 362 scraped quests.
const LENGTH_ORDER = [
  "Very Short",
  "Short",
  "Short to Medium",
  "Medium",
  "Medium to Long",
  "Long",
  "Long to Very Long",
  "Very Long",
  "Very, Very Long",
];
// Confirmed against the real client: In Progress, then Not Started, then Completed.
const PROGRESS_ORDER = { STARTED: 0, NOT_STARTED: 1, COMPLETED: 2 };

// Case-insensitive on both sides — LENGTH_ORDER is written Title Case (to
// double as its own group-header label further down) while the scraped data
// itself is inconsistent.
function orderIndex(list, value) {
  if (!value) return list.length;
  const i = list.findIndex((item) => item.toLowerCase() === String(value).toLowerCase());
  return i === -1 ? list.length : i;
}

// A leading apostrophe/quote (e.g. "'Phite Club") must be ignored for
// alphabetical ORDER too, not just its section header's label — otherwise
// the title sorts before "A" (punctuation sorts before letters) while its
// header claims "P", stranding it in its own orphan section at the very top.
function alphabeticalSortKey(title) {
  return rs3DisplayTitle(title).replace(/^[^\p{L}\p{N}]+/u, "");
}

const SORT_COMPARATORS = {
  alphabetical: (a, b) => alphabeticalSortKey(a.title).localeCompare(alphabeticalSortKey(b.title), "es"),
  members: (a, b) => Number(Boolean(a.members)) - Number(Boolean(b.members)),
  length: (a, b) => orderIndex(LENGTH_ORDER, a.length) - orderIndex(LENGTH_ORDER, b.length),
  progress: (a, b) => (PROGRESS_ORDER[questStatus(a.id)] ?? 1) - (PROGRESS_ORDER[questStatus(b.id)] ?? 1),
};

const SORT_MODES = [
  { key: "alphabetical", labelKey: "sortAlphabetical" },
  { key: "members", labelKey: "sortMembers" },
  { key: "length", labelKey: "sortLength" },
  { key: "progress", labelKey: "sortProgress" },
];

// Se construye una sola vez; los checkboxes del popover y el <select> de
// orden solo escriben en el estado y disparan onChange, nunca recrean el DOM
// de la barra en sí.
function buildFilterBar(container, onChange) {
  const bar = document.createElement("div");
  bar.id = "sidebar-filterbar";

  const filterBtn = document.createElement("button");
  filterBtn.type = "button";
  filterBtn.id = "filter-toggle-btn";
  filterBtn.title = t("filterBtnTitle");
  filterBtn.innerHTML = funnelIcon("currentColor");
  bar.appendChild(filterBtn);

  const popover = document.createElement("div");
  popover.id = "filter-popover";
  popover.hidden = true;
  const checkboxes = [
    { key: "showCompleted", labelKey: "filterCompleted" },
    { key: "showQuest", labelKey: "filterQuests" },
    { key: "showMiniquest", labelKey: "filterMiniquests" },
  ];
  checkboxes.forEach(({ key, labelKey }) => {
    const label = document.createElement("label");
    label.className = "filter-popover-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.filterKey = key;
    checkbox.checked = state.activeFilters[key];
    checkbox.addEventListener("change", () => {
      state.activeFilters[key] = checkbox.checked;
      onChange();
    });
    label.appendChild(checkbox);
    const span = document.createElement("span");
    span.dataset.labelKey = labelKey;
    span.textContent = t(labelKey);
    label.appendChild(span);
    popover.appendChild(label);
  });
  bar.appendChild(popover);

  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    popover.hidden = !popover.hidden;
  });
  document.addEventListener("click", (e) => {
    if (!popover.hidden && !popover.contains(e.target) && e.target !== filterBtn) popover.hidden = true;
  });

  const sortSelect = document.createElement("select");
  sortSelect.id = "sort-select";
  SORT_MODES.forEach(({ key, labelKey }) => {
    const option = document.createElement("option");
    option.value = key;
    option.dataset.labelKey = labelKey;
    option.textContent = t(labelKey);
    if (key === state.sortMode) option.selected = true;
    sortSelect.appendChild(option);
  });
  sortSelect.addEventListener("change", () => {
    state.sortMode = sortSelect.value;
    onChange();
  });
  bar.appendChild(sortSelect);

  container.appendChild(bar);
}

// El bar se construye una sola vez (ver comentario arriba), pero el estado
// activo/inactivo de cada checkbox sí cambia con cada clic, y sus textos
// deben seguir el idioma actual.
function syncFilterBarLanguage(filterBarEl) {
  filterBarEl.querySelector("#filter-toggle-btn").title = t("filterBtnTitle");
  filterBarEl.querySelectorAll("#filter-popover input[type=checkbox]").forEach((checkbox) => {
    checkbox.checked = Boolean(state.activeFilters[checkbox.dataset.filterKey]);
  });
  filterBarEl.querySelectorAll("#filter-popover span[data-label-key]").forEach((span) => {
    span.textContent = t(span.dataset.labelKey);
  });
  filterBarEl.querySelectorAll("#sort-select option").forEach((option) => {
    option.textContent = t(option.dataset.labelKey);
  });
}

// Verified directly against a complete real-client screenshot (all 331 items,
// every letter A-Z) rather than guessed — every ID below was individually
// confirmed ABSENT from that list. Three different reasons:
//
// 1. Hub sub-quests (23): RS3 collapses each saga's sub-quests into the ONE
//    hub row (e.g. Recipe for Disaster's 10 "Freeing X" sub-quests don't get
//    their own row — only "Recipe for Disaster" itself does). The hub quest
//    ID itself (recipe-for-disaster, dimension-of-disaster, etc.) is NOT in
//    this list — it's a real, separately-shown row.
// 2. Genuinely unavailable (5): tutorials, a lore vignette, and a
//    since-removed quest that isn't re-completable.
// 3. Seasonal quests still gated to their original event (8): confirmed by
//    name against the real list — NOT simply "any incomplete seasonal quest"
//    (Myths of the White Lands/Swept Away/Violet is Blue/Violet is Blue Too
//    are seasonal too but DO show up, meaning Jagex has since made them
//    permanently available). No scraped field distinguishes this, so it's a
//    hand-verified list; a NEWLY added seasonal quest would need the same
//    manual check against a real screenshot before being added here.
const HIDDEN_FROM_PANEL_IDS = new Set([
  // Dimension of Disaster sub-quests
  "dimension-of-disaster-coin-of-the-realm",
  "dimension-of-disaster-curse-of-arrav",
  "dimension-of-disaster-defender-of-varrock",
  "dimension-of-disaster-demon-slayer",
  "dimension-of-disaster-shield-of-arrav",
  // Once Upon a Time in Gielinor chapters
  "once-upon-a-time-in-gielinor-finale",
  "once-upon-a-time-in-gielinor-flashback",
  "once-upon-a-time-in-gielinor-foreshadowing",
  "once-upon-a-time-in-gielinor-fortunes",
  // Recipe for Disaster sub-quests
  "recipe-for-disaster-another-cook-s-quest",
  "recipe-for-disaster-defeating-the-culinaromancer",
  "recipe-for-disaster-freeing-evil-dave",
  "recipe-for-disaster-freeing-king-awowogei",
  "recipe-for-disaster-freeing-pirate-pete",
  "recipe-for-disaster-freeing-sir-amik-varze",
  "recipe-for-disaster-freeing-skrach-uglogwee",
  "recipe-for-disaster-freeing-the-goblin-generals",
  "recipe-for-disaster-freeing-the-lumbridge-sage",
  "recipe-for-disaster-freeing-the-mountain-dwarf",
  // That Old Black Magic chapters
  "that-old-black-magic-flesh-and-bone",
  "that-old-black-magic-hermy-and-bass",
  "that-old-black-magic-my-one-and-only-lute",
  "that-old-black-magic-skelly-by-everlight",
  // Genuinely unavailable/non-playable
  "anachronia-base-camp-tutorial",
  "mogre-lore-activity",
  "player-owned-farm-tutorial",
  "unstable-foundations",
  // Seasonal quests still gated to their original event
  "a-christmas-reunion",
  "cold-front",
  "corporate-egg-spionage",
  "field-of-screams",
  "great-egg-spectations",
  "guilded-eggstravaganza",
  "guys-and-dolls",
  "it-s-snow-bother",
]);

function isRs3Countable(quest) {
  return !HIDDEN_FROM_PANEL_IDS.has(quest.id);
}

function renderCounter(container) {
  const logoEl = container.querySelector("#counter-logo");
  if (logoEl && !logoEl.innerHTML) logoEl.innerHTML = compassIcon();
  const textEl = container.querySelector("#counter-text");
  const questsTextEl = container.querySelector("#counter-quests-text");
  if (!textEl) return;

  if (!isSynced()) {
    textEl.innerHTML = t("counterConfigure");
    if (questsTextEl) questsTextEl.innerHTML = "";
    return;
  }

  // Las minimisiones dan 0 puntos siempre; las de temporada sí cuentan hacia el
  // total nativo (confirmado contra una cuenta real vía RunePixels). El contador
  // siempre usa el dataset completo, sin importar qué casilleros estén activos.
  const quests = state.index.quests.filter((q) => !q.isMiniquest);
  const totalQP = quests.reduce((sum, q) => sum + (q.questPoints || 0), 0);
  const doneQP = quests.reduce(
    (sum, q) => sum + (questStatus(q.id) === "COMPLETED" ? q.questPoints || 0 : 0),
    0
  );
  const remaining = totalQP - doneQP;
  textEl.innerHTML =
    `${t("counterLabel")}<br><strong>${doneQP} / ${totalQP}</strong> <span class="counter-remaining">${t("counterRemaining", remaining)}</span>`;

  // A second, separate count of actual quests/miniquests completed (not
  // points) — a quest can be worth 0-10+ QP, so the points count alone
  // doesn't tell you how many quests as such are actually left.
  if (questsTextEl) {
    const allEntries = state.index.quests.filter(isRs3Countable);
    const totalCount = allEntries.length;
    const doneCount = allEntries.filter((q) => questStatus(q.id) === "COMPLETED").length;
    const remainingCount = totalCount - doneCount;
    questsTextEl.innerHTML =
      `${t("counterQuestsLabel")}<br><strong>${doneCount} / ${totalCount}</strong> <span class="counter-remaining">${t("counterRemaining", remainingCount)}</span>`;
  }
}

/**
 * Matches RS3's own in-game quest journal convention: a leading article
 * ("The"/"A") moves to the end after a comma (e.g. "The Elder Kiln" ->
 * "Elder Kiln, The", "A Clockwork Syringe" -> "Clockwork Syringe, A"), so it
 * alphabetizes under "E"/"C" instead of cluttering the top of the list under
 * "T"/"A". A trailing "(miniquest)"/"(saga)" tag must stay AFTER the moved
 * article, not get swallowed into the moved text (confirmed against the real
 * client: "The Curse of Zaros (miniquest)" -> "Curse of Zaros, The
 * (miniquest)", not "Curse of Zaros (miniquest), The"). A bare wiki
 * disambiguation suffix — "(quest)", used only to disambiguate the article
 * title from an unrelated same-named wiki page — isn't shown by RS3 at all,
 * so it's dropped entirely rather than kept. Display/sort only — the
 * wiki-sourced title elsewhere (detail header) keeps its natural form.
 */
function rs3DisplayTitle(title) {
  const suffixMatch = title.match(/^(.*?)(\s*\([^)]+\))$/);
  const core = suffixMatch ? suffixMatch[1] : title;
  const suffix = suffixMatch ? suffixMatch[2].trim() : "";
  const match = core.match(/^(The|A)\s+(.+)$/);
  const transformedCore = match ? `${match[2]}, ${match[1]}` : core;
  if (suffix === "(quest)") return transformedCore;
  return suffix ? `${transformedCore} ${suffix}` : transformedCore;
}

/**
 * RS3's own quest list groups rows under a section heading matching the
 * current sort mode (e.g. a plain "A"/"C" alphabet letter, or "Free"/
 * "Members") — same idea as the wiki-section headings already used for step
 * groups in detail.js.
 */
function groupLabel(quest, mode) {
  switch (mode) {
    case "alphabetical": {
      // Same leading-punctuation-stripped key as the sort comparator (e.g.
      // "'Phite Club" heads under "P", not "'"), so the header always
      // matches where the item actually landed.
      const key = alphabeticalSortKey(quest.title);
      return key ? key.charAt(0).toUpperCase() : rs3DisplayTitle(quest.title).charAt(0);
    }
    case "members":
      return quest.members ? "Members" : "Free";
    case "length":
      return quest.length || t("unknownGroupLabel");
    case "progress":
      return (
        { NOT_STARTED: "Not Started", STARTED: "In Progress", COMPLETED: "Completed" }[questStatus(quest.id)] ||
        t("unknownGroupLabel")
      );
    default:
      return null;
  }
}

function renderList(listEl, summaryEl, onSelect) {
  const visible = filterQuests(state.index.quests).sort(SORT_COMPARATORS[state.sortMode] || SORT_COMPARATORS.alphabetical);

  if (summaryEl) {
    // The visible list itself still includes non-canonical entries and
    // seasonal quests (so their guides stay reachable), but this summary
    // line counts the same way as the "quests completed" counter (see
    // isRs3Countable above) — otherwise "Showing X of Y" could show X > Y.
    const canonicalVisible = visible.filter(isRs3Countable).length;
    const total = state.index.quests.filter(isRs3Countable).length;
    summaryEl.textContent = t("showingSummary", canonicalVisible, total);
  }

  listEl.innerHTML = "";
  if (visible.length === 0) {
    const empty = document.createElement("li");
    empty.className = "quest-list-empty";
    empty.textContent = t("noResults");
    listEl.appendChild(empty);
    return;
  }

  let lastGroup = undefined;
  visible.forEach((quest) => {
    const group = groupLabel(quest, state.sortMode);
    if (group !== null && group !== lastGroup) {
      const header = document.createElement("li");
      header.className = "quest-list-section-header";
      header.textContent = group;
      listEl.appendChild(header);
      lastGroup = group;
    }

    const status = questStatus(quest.id);
    const li = document.createElement("li");
    li.className =
      !isSynced() && !quest.isMiniquest ? "status-unsynced" : `status-${status.toLowerCase().replace("_", "-")}`;
    if (quest.id === state.selectedQuestId) li.classList.add("selected");

    const displayTitle = rs3DisplayTitle(quest.title);
    const titleText = quest.isSeasonal ? `🎉 ${displayTitle}` : displayTitle;
    li.innerHTML = `<span class="row-title">${titleText}</span>`;
    li.addEventListener("click", () => onSelect(quest.id));
    listEl.appendChild(li);
  });
}

const initializedFilterBars = new WeakSet();
const initializedHeaders = new WeakSet();

/** Renders the sidebar: builds the filter/sort bar once, then (re)renders the list + counter. */
export function renderSidebar({ filterBarEl, listSummaryEl, listEl, counterEl }, onSelect) {
  if (!initializedFilterBars.has(filterBarEl)) {
    initializedFilterBars.add(filterBarEl);
    buildFilterBar(filterBarEl, () => renderSidebar({ filterBarEl, listSummaryEl, listEl, counterEl }, onSelect));
  }
  syncFilterBarLanguage(filterBarEl);

  const headerLogo = document.getElementById("header-logo");
  if (headerLogo && !initializedHeaders.has(headerLogo)) {
    initializedHeaders.add(headerLogo);
    headerLogo.innerHTML = compassIcon();
  }

  renderList(listEl, listSummaryEl, onSelect);
  renderCounter(counterEl);
}
