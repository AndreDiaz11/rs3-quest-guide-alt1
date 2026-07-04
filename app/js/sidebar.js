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
  const { showCompleted, searchText } = state.activeFilters;
  const search = normalizeSearch(searchText);
  return quests.filter((q) => {
    if (!showCompleted && questStatus(q.id) === "COMPLETED") return false;
    if (search && !normalizeSearch(q.title).includes(search)) return false;
    return true;
  });
}

function renderFilterBar(container, onChange) {
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

  const wrap = document.createElement("label");
  wrap.className = "sidebar-check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = state.activeFilters.showCompleted;
  input.addEventListener("change", () => {
    state.activeFilters.showCompleted = input.checked;
    onChange();
  });
  wrap.appendChild(input);
  wrap.appendChild(document.createTextNode("Mostrar completadas"));
  bar.appendChild(wrap);

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
    li.className = statusClass(questStatus(quest.id));
    if (quest.id === state.selectedQuestId) li.classList.add("selected");
    li.addEventListener("click", () => onSelect(quest.id));
    listEl.appendChild(li);
  });
}

/** Renders the full sidebar (search + completed toggle + flat alphabetical list + counter). */
export function renderSidebar({ filterBarEl, listEl, counterEl }, onSelect) {
  filterBarEl.innerHTML = "";
  renderFilterBar(filterBarEl, () => renderSidebar({ filterBarEl, listEl, counterEl }, onSelect));

  renderList(listEl, onSelect);
  renderCounter(counterEl);
}
