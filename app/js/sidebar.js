import { state, questStatus, isSynced } from "./state.js";
import { t } from "./i18n.js";
import {
  diamondIcon,
  checkCircleIcon,
  clockCircleIcon,
  xCircleIcon,
  calendarIcon,
  scrollIcon,
  questIcon,
  compassIcon,
  unsyncedIcon,
} from "./icons.js";

const STATUS_COLOR = {
  COMPLETED: "var(--quest-green)",
  STARTED: "var(--quest-yellow)",
  NOT_STARTED: "var(--quest-red)",
};
const MINIQUEST_COLOR = "var(--quest-miniquest)";
const EVENT_COLOR = "var(--quest-event)";

function normalizeSearch(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Every quest falls into exactly one of these 3 non-overlapping type categories. */
function questCategory(quest) {
  if (quest.isSeasonal) return "events";
  if (quest.isMiniquest) return "miniquest";
  return "quest";
}

function filterQuests(quests) {
  const { showQuest, showMiniquest, showEvents, showCompleted, showStarted, showIncomplete, searchText } =
    state.activeFilters;
  const categoryVisible = { quest: showQuest, miniquest: showMiniquest, events: showEvents };
  const statusVisible = { COMPLETED: showCompleted, STARTED: showStarted, NOT_STARTED: showIncomplete };
  const search = normalizeSearch(searchText);
  return quests.filter((q) => {
    if (!categoryVisible[questCategory(q)]) return false;
    if (!statusVisible[questStatus(q.id)]) return false;
    if (search && !normalizeSearch(q.title).includes(search)) return false;
    return true;
  });
}

// Se construye una sola vez; escribir en el buscador solo debe volver a
// dibujar la lista, nunca la barra en sí — recrear el <input> en cada letra
// le hacía perder el foco tras cada carácter.
function buildFilterBar(container, onChange) {
  const bar = document.createElement("div");
  bar.id = "sidebar-filterbar";

  const search = document.createElement("input");
  search.type = "search";
  search.id = "quest-search";
  search.placeholder = t("searchPlaceholder");
  search.value = state.activeFilters.searchText;
  search.addEventListener("input", () => {
    state.activeFilters.searchText = search.value;
    onChange();
  });
  bar.appendChild(search);

  const chipsWrap = document.createElement("div");
  chipsWrap.id = "sidebar-chips";
  // 2 columnas emparejadas por fila (tipo | estado) en vez de 3, porque textos
  // como "In Progress"/"Incomplete" no entraban en un tercio del ancho del
  // sidebar y el grid se desbordaba (ver captura del usuario).
  // Los íconos usan currentColor a propósito: así se atenúan junto con el
  // texto cuando el chip está inactivo, en vez de quedar coloridos mientras
  // el texto se ve gris (la mezcla confundía si el chip estaba activo o no).
  const chips = [
    { key: "showQuest", labelKey: "chipQuest", icon: questIcon("currentColor"), variant: "quest" },
    { key: "showCompleted", labelKey: "chipComplete", icon: checkCircleIcon("currentColor"), variant: "completed" },
    { key: "showMiniquest", labelKey: "chipMiniquest", icon: scrollIcon("currentColor"), variant: "miniquest" },
    { key: "showStarted", labelKey: "chipInProgress", icon: clockCircleIcon("currentColor"), variant: "started" },
    { key: "showEvents", labelKey: "chipEvents", icon: calendarIcon("currentColor"), variant: "events" },
    { key: "showIncomplete", labelKey: "chipIncomplete", icon: xCircleIcon("currentColor"), variant: "incomplete" },
  ];
  chips.forEach(({ key, labelKey, icon, variant }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.filterKey = key;
    btn.dataset.labelKey = labelKey;
    btn.className = `filter-chip chip-${variant}${state.activeFilters[key] ? " active" : ""}`;
    btn.innerHTML = `<span class="chip-icon">${icon}</span><span class="chip-label">${t(labelKey)}</span>`;
    btn.addEventListener("click", () => {
      state.activeFilters[key] = !state.activeFilters[key];
      onChange();
    });
    chipsWrap.appendChild(btn);
  });
  bar.appendChild(chipsWrap);

  container.appendChild(bar);
}

// El bar se construye una sola vez (ver comentario arriba), pero el estado
// activo/inactivo de cada chip sí cambia con cada clic, y sus textos deben
// seguir el idioma actual — hay que reflejar ambas cosas en cada render, si
// no los botones se quedaban visualmente congelados en su estado/idioma
// inicial aunque el filtro (o el idioma) sí hubiera cambiado.
function syncFilterBarLanguage(filterBarEl) {
  filterBarEl.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.classList.toggle("active", Boolean(state.activeFilters[btn.dataset.filterKey]));
    const labelEl = btn.querySelector(".chip-label");
    if (labelEl) labelEl.textContent = t(btn.dataset.labelKey);
  });
  const search = filterBarEl.querySelector("#quest-search");
  if (search) search.placeholder = t("searchPlaceholder");
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
    const allEntries = state.index.quests;
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
  if (!isSynced() && !quest.isMiniquest) return { diamond: "var(--text-dim)", right: unsyncedIcon("var(--text-dim)") };
  const color = STATUS_COLOR[status];
  if (quest.isSeasonal) return { diamond: color, right: calendarIcon(EVENT_COLOR) };
  if (quest.isMiniquest) return { diamond: color, right: scrollIcon(MINIQUEST_COLOR) };
  if (status === "COMPLETED") return { diamond: color, right: checkCircleIcon(color) };
  if (status === "STARTED") return { diamond: color, right: clockCircleIcon(color) };
  return { diamond: color, right: xCircleIcon(color) };
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

function renderList(listEl, onSelect) {
  const visible = filterQuests(state.index.quests).sort((a, b) =>
    rs3DisplayTitle(a.title).localeCompare(rs3DisplayTitle(b.title), "es")
  );

  listEl.innerHTML = "";
  if (visible.length === 0) {
    const empty = document.createElement("li");
    empty.className = "quest-list-empty";
    empty.textContent = t("noResults");
    listEl.appendChild(empty);
    return;
  }

  visible.forEach((quest) => {
    const status = questStatus(quest.id);
    const { diamond, right } = rowVisual(quest);
    const li = document.createElement("li");
    li.className =
      !isSynced() && !quest.isMiniquest ? "status-unsynced" : `status-${status.toLowerCase().replace("_", "-")}`;
    if (quest.id === state.selectedQuestId) li.classList.add("selected");

    const displayTitle = rs3DisplayTitle(quest.title);
    const titleText = quest.isSeasonal ? `🎉 ${displayTitle}` : displayTitle;
    li.innerHTML =
      `<span class="row-diamond">${diamondIcon(diamond)}</span>` +
      `<span class="row-title">${titleText}</span>` +
      `<span class="row-status">${right}</span>`;
    li.addEventListener("click", () => onSelect(quest.id));
    listEl.appendChild(li);
  });
}

const initializedFilterBars = new WeakSet();
const initializedHeaders = new WeakSet();

/** Renders the sidebar: builds the search/chips bar once, then (re)renders the list + counter. */
export function renderSidebar({ filterBarEl, listEl, counterEl }, onSelect) {
  if (!initializedFilterBars.has(filterBarEl)) {
    initializedFilterBars.add(filterBarEl);
    buildFilterBar(filterBarEl, () => renderSidebar({ filterBarEl, listEl, counterEl }, onSelect));
  }
  syncFilterBarLanguage(filterBarEl);

  const headerLogo = document.getElementById("header-logo");
  if (headerLogo && !initializedHeaders.has(headerLogo)) {
    initializedHeaders.add(headerLogo);
    headerLogo.innerHTML = compassIcon();
  }

  renderList(listEl, onSelect);
  renderCounter(counterEl);
}
