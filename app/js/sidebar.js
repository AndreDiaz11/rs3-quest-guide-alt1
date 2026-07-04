import { state, questStatus } from "./state.js";
import { statusClass } from "./colors.js";

function normalizeSearch(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function filterQuests(quests) {
  const { showCompleted, showEvents, searchText } = state.activeFilters;
  const search = normalizeSearch(searchText);
  return quests.filter((q) => {
    if (!showCompleted && questStatus(q.id) === "COMPLETED") return false;
    if (!showEvents && q.isSeasonal && questStatus(q.id) !== "COMPLETED") return false;
    if (search && !normalizeSearch(q.title).includes(search)) return false;
    return true;
  });
}

/** A button whose own label reflects the action it performs next (toggle pattern). */
function buildToggleButton({ getState, labelWhenOn, labelWhenOff, onToggle }) {
  const button = document.createElement("button");
  button.className = "sidebar-toggle";
  const sync = () => {
    button.textContent = getState() ? labelWhenOn : labelWhenOff;
  };
  button.addEventListener("click", () => {
    onToggle();
    sync();
  });
  sync();
  return button;
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

  const togglesWrap = document.createElement("div");
  togglesWrap.id = "sidebar-toggles";

  togglesWrap.appendChild(
    buildToggleButton({
      getState: () => state.activeFilters.showCompleted,
      labelWhenOn: "Ocultar Completados",
      labelWhenOff: "Mostrar Completados",
      onToggle: () => {
        state.activeFilters.showCompleted = !state.activeFilters.showCompleted;
        onChange();
      },
    })
  );

  togglesWrap.appendChild(
    buildToggleButton({
      getState: () => state.activeFilters.showEvents,
      labelWhenOn: "Ocultar Eventos",
      labelWhenOff: "Mostrar Eventos",
      onToggle: () => {
        state.activeFilters.showEvents = !state.activeFilters.showEvents;
        onChange();
      },
    })
  );

  bar.appendChild(togglesWrap);
  container.appendChild(bar);
}

function renderCounter(container) {
  // Las minimisiones dan 0 puntos siempre; las de temporada sí cuentan hacia el
  // total nativo (confirmado contra una cuenta real vía RunePixels).
  const quests = state.index.quests.filter((q) => !q.isMiniquest);
  const totalQP = quests.reduce((sum, q) => sum + (q.questPoints || 0), 0);
  const doneQP = quests.reduce(
    (sum, q) => sum + (questStatus(q.id) === "COMPLETED" ? q.questPoints || 0 : 0),
    0
  );
  container.textContent = `Puntos de misión: ${doneQP} / ${totalQP} (quedan ${totalQP - doneQP})`;
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
    const li = document.createElement("li");
    li.textContent = quest.isSeasonal ? `${quest.title} 🎉` : quest.title;
    li.className = statusClass(questStatus(quest.id), quest.isSeasonal);
    if (quest.id === state.selectedQuestId) li.classList.add("selected");
    li.addEventListener("click", () => onSelect(quest.id));
    listEl.appendChild(li);
  });
}

const initializedFilterBars = new WeakSet();

/** Renders the sidebar: builds the search/toggle bar once, then (re)renders the list + counter. */
export function renderSidebar({ filterBarEl, listEl, counterEl }, onSelect) {
  if (!initializedFilterBars.has(filterBarEl)) {
    initializedFilterBars.add(filterBarEl);
    buildFilterBar(filterBarEl, () => renderSidebar({ filterBarEl, listEl, counterEl }, onSelect));
  }

  renderList(listEl, onSelect);
  renderCounter(counterEl);
}
