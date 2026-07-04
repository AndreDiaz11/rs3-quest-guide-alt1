import { state, questStatus } from "./state.js";
import { statusClass } from "./colors.js";

function normalizeSearch(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Every quest falls into exactly one of these 3 non-overlapping buckets. */
function questBucket(quest) {
  if (questStatus(quest.id) === "COMPLETED") return "completed";
  if (quest.isSeasonal) return "events";
  return "incomplete";
}

function filterQuests(quests) {
  const { showCompleted, showIncomplete, showEvents, showMiniquests, searchText } = state.activeFilters;
  const bucketVisible = { completed: showCompleted, incomplete: showIncomplete, events: showEvents };
  const search = normalizeSearch(searchText);
  return quests.filter((q) => {
    if (!showMiniquests && q.isMiniquest) return false;
    if (!bucketVisible[questBucket(q)]) return false;
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

  const checksWrap = document.createElement("div");
  checksWrap.id = "sidebar-checks";
  const checkboxes = [
    { key: "showCompleted", label: "Completadas" },
    { key: "showIncomplete", label: "Incompletas" },
    { key: "showEvents", label: "Eventos" },
    { key: "showMiniquests", label: "Minimisiones" },
  ];
  checkboxes.forEach(({ key, label }) => {
    const wrap = document.createElement("label");
    wrap.className = "sidebar-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.activeFilters[key];
    input.addEventListener("change", () => {
      state.activeFilters[key] = input.checked;
      onChange();
    });
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode(label));
    checksWrap.appendChild(wrap);
  });
  bar.appendChild(checksWrap);

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

/** Renders the sidebar: builds the search/checkbox bar once, then (re)renders the list + counter. */
export function renderSidebar({ filterBarEl, listEl, counterEl }, onSelect) {
  if (!initializedFilterBars.has(filterBarEl)) {
    initializedFilterBars.add(filterBarEl);
    buildFilterBar(filterBarEl, () => renderSidebar({ filterBarEl, listEl, counterEl }, onSelect));
  }

  renderList(listEl, onSelect);
  renderCounter(counterEl);
}
