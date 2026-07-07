import { state, questStatus, isSynced, isQuestLocked } from "./state.js";
import { t } from "./i18n.js";
import {
  checkCircleIcon,
  clockCircleIcon,
  xCircleIcon,
  calendarIcon,
  scrollIcon,
  compassIcon,
  unsyncedIcon,
  funnelIcon,
} from "./icons.js";

const STATUS_COLOR = {
  COMPLETED: "var(--quest-green)",
  STARTED: "var(--quest-yellow)",
  NOT_STARTED: "var(--quest-red)",
};
const MINIQUEST_COLOR = "var(--quest-miniquest)";
const EVENT_COLOR = "var(--quest-event)";

/**
 * RS3's own "Locked" status takes priority for filtering purposes: a quest
 * whose requirements aren't met is locked regardless of its RuneMetrics
 * status. "Available" (not locked, not completed — whether untouched or
 * in-progress) has no checkbox of its own in-game, so it isn't a real
 * bucket here either — it just passes the status check unconditionally.
 */
function questStatusBucket(quest) {
  if (isQuestLocked(quest)) return "locked";
  if (questStatus(quest.id) === "COMPLETED") return "completed";
  return "available";
}

function filterQuests(quests) {
  const { showQuest, showMiniquest, showLocked, showCompleted } = state.activeFilters;
  const typeVisible = { quest: showQuest, miniquest: showMiniquest };
  return quests.filter((q) => {
    // Matches the real client's panel exactly: non-canonical entries
    // (tutorials/lore/saga sub-chapters) and currently-existing seasonal
    // quests never appear in RS3's own quest list at all, not just its count.
    if (!isRs3Countable(q)) return false;
    if (!typeVisible[q.isMiniquest ? "miniquest" : "quest"]) return false;
    const bucket = questStatusBucket(q);
    if (bucket === "locked") return showLocked;
    if (bucket === "completed") return showCompleted;
    return true; // "available" always shows once its type is checked
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
    { key: "showLocked", labelKey: "filterLocked" },
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

// RuneMetrics tracks these 20 entries (so they must stay in the dataset for
// completion-sync purposes), but they're tutorials, lore vignettes, or
// episodic saga sub-chapters that give 0 quest points and that RS3's own
// in-game quest journal doesn't count as a real "Quest"/"Miniquest" in its
// own totals (confirmed: our raw total of 362 vs the game's own "showing all
// 331 items" narrows to a ~3-entry gap once these + seasonal + removed
// content are excluded). Kept as a fixed id list here (not a dataset field)
// since it's a display-only classification, not something re-scraping needs
// to know about.
const NON_CANONICAL_IDS = new Set([
  "aftermath",
  "anachronia-base-camp-tutorial",
  "battle-of-the-monolith",
  "desperate-creatures",
  "eye-of-het-i",
  "eye-of-het-ii",
  "mogre-lore-activity",
  "once-upon-a-time-in-gielinor-finale",
  "once-upon-a-time-in-gielinor-flashback",
  "once-upon-a-time-in-gielinor-foreshadowing",
  "once-upon-a-time-in-gielinor-fortunes",
  "player-owned-farm-tutorial",
  "raksha-the-shadow-colossus-quest",
  "recipe-for-disaster",
  "sins-of-the-father",
  "that-old-black-magic-flesh-and-bone",
  "that-old-black-magic-hermy-and-bass",
  "that-old-black-magic-my-one-and-only-lute",
  "that-old-black-magic-skelly-by-everlight",
  "the-vault-of-shadows",
]);

// RS3's own quest list also excludes every CURRENTLY-EXISTING seasonal quest
// entirely from its own total, all the time — not just while its event is
// inactive (verified: 342 non-canonical quests minus these 11 non-removed
// seasonal ones = exactly 331, matching the real client's own "Showing all
// 331 items" count). A seasonal quest that's since been removed from the
// game (e.g. Guilded Eggstravaganza) is NOT excluded by this rule — it
// behaves like ordinary legacy content, kept only for its historical QP.
function isRs3Countable(quest) {
  if (NON_CANONICAL_IDS.has(quest.id)) return false;
  if (quest.isSeasonal && !quest.removedDate) return false;
  return true;
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

// El color (verde/amarillo/rojo) siempre refleja el estado REAL de la misión,
// sin importar el tipo — antes las misiones de temporada se veían siempre en
// azul aunque estuvieran incompletas, lo cual confundía con "incompleta" de
// verdad (rojo). El ícono de la derecha sí distingue el tipo (calendario para
// eventos, pergamino para minimisiones).
function rowVisual(quest) {
  const status = questStatus(quest.id);
  if (!isSynced() && !quest.isMiniquest) return { right: unsyncedIcon("var(--text-dim)") };
  const color = STATUS_COLOR[status];
  if (quest.isSeasonal) return { right: calendarIcon(EVENT_COLOR) };
  if (quest.isMiniquest) return { right: scrollIcon(MINIQUEST_COLOR) };
  if (status === "COMPLETED") return { right: checkCircleIcon(color) };
  if (status === "STARTED") return { right: clockCircleIcon(color) };
  return { right: xCircleIcon(color) };
}

/**
 * Matches RS3's own in-game quest journal convention: a leading article
 * ("The"/"A") moves to the end after a comma (e.g. "The Elder Kiln" ->
 * "Elder Kiln, The", "A Clockwork Syringe" -> "Clockwork Syringe, A"), so it
 * alphabetizes under "E"/"C" instead of cluttering the top of the list under
 * "T"/"A". Display/sort only — the wiki-sourced title elsewhere (detail
 * header) keeps its natural "The X"/"A X" form.
 */
function rs3DisplayTitle(title) {
  const match = title.match(/^(The|A)\s+(.+)$/);
  return match ? `${match[2]}, ${match[1]}` : title;
}

/**
 * RS3's own quest list groups rows under a section heading matching the
 * current sort mode (e.g. "FIFTH AGE"/"SIXTH AGE", or a plain "A"/"C"
 * alphabet letter, or the release year) — same idea as the wiki-section
 * headings already used for step groups in detail.js.
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
      return quest.length || "Unknown";
    case "progress":
      return (
        { NOT_STARTED: "Not Started", STARTED: "In Progress", COMPLETED: "Completed" }[questStatus(quest.id)] ||
        "Unknown"
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
    const { right } = rowVisual(quest);
    const li = document.createElement("li");
    li.className =
      !isSynced() && !quest.isMiniquest ? "status-unsynced" : `status-${status.toLowerCase().replace("_", "-")}`;
    if (quest.id === state.selectedQuestId) li.classList.add("selected");

    const displayTitle = rs3DisplayTitle(quest.title);
    const titleText = quest.isSeasonal ? `🎉 ${displayTitle}` : displayTitle;
    li.innerHTML =
      `<span class="row-title">${titleText}</span>` +
      `<span class="row-status">${right}</span>`;
    li.addEventListener("click", () => onSelect(quest.id));
    listEl.appendChild(li);
  });
}

const initializedFilterBars = new WeakSet();
const initializedHeaders = new WeakSet();

/** Renders the sidebar: builds the search/chips bar once, then (re)renders the list + counter. */
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
