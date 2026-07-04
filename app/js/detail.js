function localizedText(field, lang) {
  if (!field) return "";
  return field[lang] || field.en || "";
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

function renderItemChip(item) {
  const chip = el("span", { class: "item-chip" });
  if (item.image) {
    chip.appendChild(el("img", { src: item.image, alt: item.name }));
  }
  chip.appendChild(document.createTextNode(item.display || item.name));
  return chip;
}

function renderRewardChip(reward) {
  const chip = el("span", { class: "item-chip" });
  if (reward.image) chip.appendChild(el("img", { src: reward.image, alt: reward.name || "" }));
  chip.appendChild(document.createTextNode(reward.display));
  return chip;
}

/**
 * Renders the right-panel quest detail into `container`. `isCompleted`
 * (from RuneMetrics, wired in M2) forces every step checked and read-only;
 * otherwise steps use manual localStorage-backed checkboxes.
 */
export function renderQuestDetail(container, quest, { lang = "en", isCompleted = false, status = null } = {}) {
  container.innerHTML = "";
  const manualChecks = loadManualChecks(quest.id);

  const header = el("div", { class: "quest-header" });
  if (quest.icon) header.appendChild(el("img", { src: quest.icon, alt: "" }));
  header.appendChild(el("h1", { text: quest.title }));
  container.appendChild(header);

  if (status === "LOCKED") {
    container.appendChild(
      el("div", {
        class: "locked-banner",
        text: "Todavía no cumples los requisitos para empezar esta misión (según RuneMetrics).",
      })
    );
  }

  container.appendChild(
    el("div", {
      class: "quest-meta-updated",
      text: `Guía actualizada: ${new Date(quest.guideLastUpdated).toLocaleDateString("es-ES")}`,
    })
  );

  const metaGrid = el("dl", { class: "quest-meta-grid" });
  const addMeta = (label, value) => {
    if (!value) return;
    metaGrid.appendChild(el("dt", { text: label }));
    metaGrid.appendChild(el("dd", { text: value }));
  };
  addMeta("Punto de inicio", localizedText(quest.startPoint, lang));
  addMeta("Serie", quest.series);
  addMeta("Edad", quest.age);
  addMeta("Miembros", quest.members ? "Sí" : "No");
  addMeta("Longitud", quest.length);
  addMeta("Nivel de combate", quest.combatLevel);
  addMeta("Fecha de lanzamiento", quest.releaseDate);
  if (quest.requirements?.skills?.length) {
    addMeta(
      "Requisitos",
      quest.requirements.skills.map((s) => `${s.skill} ${s.level}`).join(", ")
    );
  }
  if (quest.requirements?.quests?.length) {
    addMeta("Misiones requeridas", quest.requirements.quests.join(", "));
  }
  container.appendChild(metaGrid);

  if (quest.items?.length) {
    container.appendChild(el("h2", { class: "section-title", text: "Items requeridos" }));
    const itemsWrap = el("div");
    quest.items.forEach((item) => itemsWrap.appendChild(renderItemChip(item)));
    container.appendChild(itemsWrap);
  }

  if (quest.rewards?.length) {
    container.appendChild(el("h2", { class: "section-title", text: "Recompensas" }));
    const rewardsWrap = el("div");
    quest.rewards.forEach((reward) => rewardsWrap.appendChild(renderRewardChip(reward)));
    container.appendChild(rewardsWrap);
  }

  if (quest.postQuest?.length) {
    container.appendChild(
      el("h2", { class: "section-title", text: "Recompensas adicionales (reclamo manual)" })
    );
    const list = el("ul", { class: "postquest-list" });
    quest.postQuest.forEach((entry) => list.appendChild(el("li", { text: entry.display })));
    container.appendChild(list);
  }

  container.appendChild(el("h2", { class: "section-title", text: "Pasos" }));
  const stepList = el("ul", { class: "step-list" });
  quest.steps.forEach((step) => {
    const checked = isCompleted || manualChecks.has(step.index);
    const li = el("li", { class: `indent-${step.indent}${checked ? " checked" : ""}` });
    const checkbox = el("input", { type: "checkbox" });
    checkbox.checked = checked;
    checkbox.disabled = isCompleted;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) manualChecks.add(step.index);
      else manualChecks.delete(step.index);
      saveManualChecks(quest.id, manualChecks);
      li.classList.toggle("checked", checkbox.checked);
    });
    li.appendChild(checkbox);
    li.appendChild(el("span", { text: localizedText(step.text, lang) }));
    stepList.appendChild(li);
  });
  container.appendChild(stepList);
}
