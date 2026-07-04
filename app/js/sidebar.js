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

// Mismo orden que usa la interfaz nativa de RS3 para agrupar por longitud
// (de más corta a más larga), en vez de orden alfabético.
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

// Grupos colapsados por el usuario (por etiqueta de grupo), se pierde al recargar
// la app — no hace falta persistirlo entre sesiones.
const collapsedGroups = new Set();

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
  const { showLocked, showCompleted, showQuests, showMiniquests, showSeasonal } = state.activeFilters;
  return quests.filter((q) => {
    if (q.isSeasonal && !showSeasonal) return false;
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

  let groupLabels;
  if (sortBy === "length") {
    groupLabels = [...groups.keys()].sort((a, b) => {
      const ia = LENGTH_ORDER.indexOf(a);
      const ib = LENGTH_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, "es");
      if (ia === -1) return 1; // desconocidas al final
      if (ib === -1) return -1;
      return ia - ib;
    });
  } else {
    groupLabels = [...groups.keys()].sort((a, b) => a.localeCompare(b, "es"));
  }

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
    { key: "showSeasonal", label: "Mostrar misiones de temporada (eventos)" },
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

function renderList(listEl, onSelect) {
  const visible = filterQuests(state.index.quests);
  const grouped = groupAndSort(visible, state.activeFilters.sortBy);

  listEl.innerHTML = "";
  grouped.forEach((group) => {
    const isCollapsed = group.label && collapsedGroups.has(group.label);
    if (group.label) {
      const heading = document.createElement("li");
      heading.className = "quest-group-heading";
      heading.innerHTML = `<span class="group-toggle">${isCollapsed ? "▶" : "▼"}</span> ${group.label} <span class="group-count">(${group.items.length})</span>`;
      heading.addEventListener("click", () => {
        if (isCollapsed) collapsedGroups.delete(group.label);
        else collapsedGroups.add(group.label);
        renderList(listEl, onSelect);
      });
      listEl.appendChild(heading);
    }
    if (isCollapsed) return;
    group.items.forEach((quest) => {
      const li = document.createElement("li");
      li.textContent = quest.isSeasonal ? `${quest.title} 🎉` : quest.title;
      li.className = statusClass(questStatus(quest.id));
      if (quest.id === state.selectedQuestId) li.classList.add("selected");
      li.addEventListener("click", () => onSelect(quest.id));
      listEl.appendChild(li);
    });
  });
}

/** Renders the full sidebar (filter bar + grouped quest list + counter) into the given elements. */
export function renderSidebar({ filterBarEl, listEl, counterEl }, onSelect) {
  filterBarEl.innerHTML = "";
  renderFilterBar(filterBarEl, () => renderSidebar({ filterBarEl, listEl, counterEl }, onSelect));

  renderList(listEl, onSelect);
  renderCounter(counterEl);
}
