import { state, questStatus } from "./state.js";
import {
  diamondIcon,
  checkCircleIcon,
  clockCircleIcon,
  xCircleIcon,
  calendarIcon,
  scrollIcon,
  questIcon,
  compassIcon,
} from "./icons.js";

const STATUS_COLOR = {
  COMPLETED: "var(--quest-green)",
  STARTED: "var(--quest-yellow)",
  NOT_STARTED: "var(--quest-red)",
};
const EVENT_COLOR = "var(--quest-event)";
const MINIQUEST_COLOR = "var(--quest-miniquest)";

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
  search.placeholder = "Buscar misión...";
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
  const chips = [
    { key: "showQuest", label: "Quest", icon: questIcon("var(--quest-chip-icon)"), variant: "quest" },
    { key: "showCompleted", label: "Complete", icon: checkCircleIcon("var(--quest-green)"), variant: "completed" },
    { key: "showMiniquest", label: "Miniquest", icon: scrollIcon("var(--quest-miniquest)"), variant: "miniquest" },
    { key: "showStarted", label: "In Progress", icon: clockCircleIcon("var(--quest-yellow)"), variant: "started" },
    { key: "showEvents", label: "Events", icon: calendarIcon("var(--quest-event)"), variant: "events" },
    { key: "showIncomplete", label: "Incomplete", icon: xCircleIcon("var(--quest-red)"), variant: "incomplete" },
  ];
  chips.forEach(({ key, label, icon, variant }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-chip chip-${variant}${state.activeFilters[key] ? " active" : ""}`;
    btn.innerHTML = `<span class="chip-icon">${icon}</span><span>${label}</span>`;
    btn.addEventListener("click", () => {
      state.activeFilters[key] = !state.activeFilters[key];
      onChange();
    });
    chipsWrap.appendChild(btn);
  });
  bar.appendChild(chipsWrap);

  container.appendChild(bar);
}

function renderCounter(container) {
  // Las minimisiones dan 0 puntos siempre; las de temporada sí cuentan hacia el
  // total nativo (confirmado contra una cuenta real vía RunePixels). El contador
  // siempre usa el dataset completo, sin importar qué casilleros estén activos.
  const quests = state.index.quests.filter((q) => !q.isMiniquest);
  const totalQP = quests.reduce((sum, q) => sum + (q.questPoints || 0), 0);
  const doneQP = quests.reduce(
    (sum, q) => sum + (questStatus(q.id) === "COMPLETED" ? q.questPoints || 0 : 0),
    0
  );
  const logoEl = container.querySelector("#counter-logo");
  if (logoEl && !logoEl.innerHTML) logoEl.innerHTML = compassIcon();
  const textEl = container.querySelector("#counter-text");
  const remaining = totalQP - doneQP;
  if (textEl) {
    textEl.innerHTML =
      `Puntos de misión<br><strong>${doneQP} / ${totalQP}</strong> <span class="counter-remaining">(quedan ${remaining})</span>`;
  }
}

function rowVisual(quest) {
  const status = questStatus(quest.id);
  if (quest.isSeasonal) return { diamond: EVENT_COLOR, right: calendarIcon("var(--quest-event)") };
  if (quest.isMiniquest) return { diamond: STATUS_COLOR[status], right: scrollIcon(MINIQUEST_COLOR) };
  if (status === "COMPLETED") return { diamond: STATUS_COLOR[status], right: checkCircleIcon(STATUS_COLOR[status]) };
  if (status === "STARTED") return { diamond: STATUS_COLOR[status], right: clockCircleIcon(STATUS_COLOR[status]) };
  return { diamond: STATUS_COLOR[status], right: xCircleIcon(STATUS_COLOR[status]) };
}

function renderList(listEl, onSelect) {
  const visible = filterQuests(state.index.quests).sort((a, b) => a.title.localeCompare(b.title, "es"));

  listEl.innerHTML = "";
  if (visible.length === 0) {
    const empty = document.createElement("li");
    empty.className = "quest-list-empty";
    empty.textContent = "Sin resultados.";
    listEl.appendChild(empty);
    return;
  }

  visible.forEach((quest) => {
    const status = questStatus(quest.id);
    const { diamond, right } = rowVisual(quest);
    const li = document.createElement("li");
    li.className = quest.isSeasonal ? "status-locked" : `status-${status.toLowerCase().replace("_", "-")}`;
    if (quest.id === state.selectedQuestId) li.classList.add("selected");

    const titleText = quest.isSeasonal ? `${quest.title} 🎉` : quest.title;
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

  const headerLogo = document.getElementById("header-logo");
  if (headerLogo && !initializedHeaders.has(headerLogo)) {
    initializedHeaders.add(headerLogo);
    headerLogo.innerHTML = compassIcon();
  }

  renderList(listEl, onSelect);
  renderCounter(counterEl);
}
