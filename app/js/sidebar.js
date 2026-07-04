import { state, questStatus } from "./state.js";
import { statusClass } from "./colors.js";

const SORT_MODES = [
  { id: "alphabetical", label: "Alfabético" },
  { id: "combat", label: "Combate" },
  { id: "age", label: "Edad" },
  { id: "members", label: "Miembros/F2P" },
  { id: "length", label: "Longitud" },
  { id: "progress", label: "Progreso" },
  { id: "releaseDate", label: "Fecha de lanzamiento" },
  { id: "series", label: "Serie" },
  { id: "startLocation", label: "Ubicación de inicio" },
  { id: "timeline", label: "Línea temporal" },
];

const PROGRESS_LABELS = {
  COMPLETED: "Completadas",
  STARTED: "En curso",
  NOT_STARTED: "No iniciadas",
  LOCKED: "Bloqueadas",
};

function groupKey(quest, sortBy) {
  switch (sortBy) {
    case "combat":
      return quest.combatLevel || "Sin requisito de combate";
    case "age":
      return quest.age || "Sin edad";
    case "members":
      return quest.members ? "Miembros" : "Gratuitas (F2P)";
    case "length":
      return quest.length || "Sin longitud";
    case "progress":
      return PROGRESS_LABELS[questStatus(quest.id)];
    case "releaseDate":
      return quest.releaseDate ? quest.releaseDate.split(" ").pop() : "Fecha desconocida"; // agrupa por año
    case "series":
      return quest.series || "Sin serie";
    case "startLocation":
      return quest.startLocation || "Ubicación desconocida";
    case "timeline":
      return quest.timeline || quest.age || "Sin línea temporal";
    case "alphabetical":
    default:
      return null; // sin agrupar, lista plana
  }
}

function filterQuests(quests) {
  const { showLocked, showCompleted, showQuests, showMiniquests } = state.activeFilters;
  return quests.filter((q) => {
    if (q.isMiniquest && !showMiniquests) return false;
    if (!q.isMiniquest && !showQuests) return false;
    const status = questStatus(q.id);
    if (status === "LOCKED" && !showLocked) return false;
    if (status === "COMPLETED" && !showCompleted) return false;
    return true;
  });
}

function groupAndSort(quests, sortBy) {
  if (sortBy === "alphabetical") {
    return [{ label: null, items: [...quests].sort((a, b) => a.title.localeCompare(b.title, "es")) }];
  }

  const groups = new Map();
  for (const quest of quests) {
    const key = groupKey(quest, sortBy);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(quest);
  }

  const groupLabels = [...groups.keys()].sort((a, b) => a.localeCompare(b, "es"));
  return groupLabels.map((label) => ({
    label,
    items: groups.get(label).sort((a, b) => a.title.localeCompare(b.title, "es")),
  }));
}

function renderFilterBar(container, onChange) {
  const bar = document.createElement("div");
  bar.id = "sidebar-filterbar";

  const select = document.createElement("select");
  select.id = "sort-select";
  SORT_MODES.forEach((mode) => {
    const opt = document.createElement("option");
    opt.value = mode.id;
    opt.textContent = mode.label;
    if (mode.id === state.activeFilters.sortBy) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    state.activeFilters.sortBy = select.value;
    onChange();
  });
  bar.appendChild(select);

  const checkboxes = [
    { key: "showLocked", label: "Mostrar bloqueadas" },
    { key: "showCompleted", label: "Mostrar completadas" },
    { key: "showQuests", label: "Mostrar misiones" },
    { key: "showMiniquests", label: "Mostrar minimisiones" },
  ];
  const checksWrap = document.createElement("div");
  checksWrap.id = "sidebar-checks";
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
  const quests = state.index.quests.filter((q) => !q.isMiniquest);
  const totalQP = quests.reduce((sum, q) => sum + (q.questPoints || 0), 0);
  const doneQP = quests.reduce(
    (sum, q) => sum + (questStatus(q.id) === "COMPLETED" ? q.questPoints || 0 : 0),
    0
  );
  container.textContent = `Puntos de misión: ${doneQP} / ${totalQP} (quedan ${totalQP - doneQP})`;
}

/** Renders the full sidebar (filter bar + grouped quest list + counter) into the given elements. */
export function renderSidebar({ filterBarEl, listEl, counterEl }, onSelect) {
  filterBarEl.innerHTML = "";
  renderFilterBar(filterBarEl, () => renderSidebar({ filterBarEl, listEl, counterEl }, onSelect));

  const visible = filterQuests(state.index.quests);
  const grouped = groupAndSort(visible, state.activeFilters.sortBy);

  listEl.innerHTML = "";
  grouped.forEach((group) => {
    if (group.label) {
      const heading = document.createElement("li");
      heading.className = "quest-group-heading";
      heading.textContent = group.label;
      listEl.appendChild(heading);
    }
    group.items.forEach((quest) => {
      const li = document.createElement("li");
      li.textContent = quest.title;
      li.className = statusClass(questStatus(quest.id));
      if (quest.id === state.selectedQuestId) li.classList.add("selected");
      li.addEventListener("click", () => onSelect(quest.id));
      listEl.appendChild(li);
    });
  });

  renderCounter(counterEl);
}
