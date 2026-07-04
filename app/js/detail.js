import { meetsQuestRequirement, meetsSkillRequirement } from "./state.js";

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

/** Renders a ✓/✗/? marker for a requirement, matching the wiki's checklist style. */
function requirementMarker(met) {
  if (met === true) return el("span", { class: "req-met", text: "✓" });
  if (met === false) return el("span", { class: "req-unmet", text: "✗" });
  return el("span", { class: "req-unknown", text: "?" });
}

function renderRequirementsList(quest) {
  const wrap = el("div", { class: "requirements-list" });

  const skills = quest.requirements?.skills || [];
  const quests = quest.requirements?.quests || [];
  if (skills.length === 0 && quests.length === 0) return null;

  if (quests.length > 0) {
    const ul = el("ul", { class: "requirement-items" });
    quests.forEach((title) => {
      const li = el("li");
      li.appendChild(requirementMarker(meetsQuestRequirement(title)));
      li.appendChild(document.createTextNode(" " + title));
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  }

  if (skills.length > 0) {
    const ul = el("ul", { class: "requirement-items" });
    skills.forEach((req) => {
      const li = el("li");
      li.appendChild(requirementMarker(meetsSkillRequirement(req)));
      li.appendChild(document.createTextNode(` ${req.skill} ${req.level}`));
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  }

  return wrap;
}

/**
 * Formats one raw chat option line for display: a leading number (the actual
 * in-game dialogue button, kept untranslated) gets split out as "N." followed
 * by the dialogue in quotes and italics; plain UI text (e.g. "Accept", "Any",
 * with no number) is shown as-is.
 */
function renderChatOptionLine(opt) {
  const li = el("li");
  const match = opt.match(/^(\d+)\s+(.+)$/);
  if (match) {
    const [, num, dialogue] = match;
    li.appendChild(el("span", { class: "chat-opt-num", text: `${num}.` }));
    li.appendChild(el("em", { class: "chat-opt-text", text: `"${dialogue}"` }));
  } else {
    li.appendChild(document.createTextNode(opt));
  }
  return li;
}

/** Small chat-icon button that opens a floating popup listing each option (English marker, Spanish/local dialogue text). */
function renderChatOptionsButton(options, lang) {
  const btn = el("button", { class: "chat-options-btn", type: "button", title: "Opciones de chat", text: "💬" });
  btn.addEventListener("click", () => {
    const existing = document.querySelector(".chat-options-popup");
    existing?.remove();
    if (existing && existing.dataset.forBtn === btn.dataset.chatBtnId) return; // clicking the same button again just closes it

    const popup = el("div", { class: "chat-options-popup" });
    const list = el("ul");
    options.forEach((opt) => list.appendChild(renderChatOptionLine(opt)));
    popup.appendChild(list);
    const close = el("button", { class: "chat-options-close", type: "button", text: "✕" });
    close.addEventListener("click", () => popup.remove());
    popup.appendChild(close);

    const btnId = String(Date.now());
    btn.dataset.chatBtnId = btnId;
    popup.dataset.forBtn = btnId;

    document.body.appendChild(popup);
    const rect = btn.getBoundingClientRect();
    const maxLeft = window.innerWidth - popup.offsetWidth - 8;
    popup.style.top = `${rect.bottom + 6}px`;
    popup.style.left = `${Math.min(rect.left, maxLeft)}px`;
  });
  return btn;
}

/**
 * Renders the right-panel quest detail into `container`. `isCompleted`
 * (from RuneMetrics, wired in M2) forces every step checked and read-only;
 * otherwise steps use manual localStorage-backed checkboxes. Layout follows
 * the wiki's own Quick guide structure: header -> meta -> requirements (with
 * ✓/✗ against the real account) -> items (chips + list) -> steps grouped
 * under their wiki section headings (English titles, no new translation
 * cost) -> rewards at the bottom with the wiki's banner image.
 */
export function renderQuestDetail(container, quest, { lang = "en", isCompleted = false } = {}) {
  container.innerHTML = "";
  const manualChecks = loadManualChecks(quest.id);

  const header = el("div", { class: "quest-header" });
  if (quest.icon) header.appendChild(el("img", { src: quest.icon, alt: "" }));
  header.appendChild(el("h1", { text: quest.title }));
  container.appendChild(header);

  if (quest.isSeasonal) {
    container.appendChild(
      el("div", {
        class: "seasonal-banner",
        text: "🎉 Misión de temporada: solo se puede jugar mientras el evento correspondiente está activo en el juego.",
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
  container.appendChild(metaGrid);

  const requirementsList = renderRequirementsList(quest);
  if (requirementsList) {
    container.appendChild(el("h2", { class: "section-title", text: "Requisitos" }));
    container.appendChild(requirementsList);
  }

  if (quest.items?.length) {
    container.appendChild(el("h2", { class: "section-title", text: "Items requeridos" }));
    const itemsWrap = el("div");
    quest.items.forEach((item) => itemsWrap.appendChild(renderItemChip(item)));
    container.appendChild(itemsWrap);

    const itemsList = el("ul", { class: "items-plain-list" });
    quest.items.forEach((item) => {
      const li = el("li");
      if (item.image) li.appendChild(el("img", { src: item.image, alt: item.name }));
      li.appendChild(document.createTextNode(item.display || item.name));
      itemsList.appendChild(li);
    });
    container.appendChild(itemsList);
  }

  if (quest.guideNote) {
    container.appendChild(
      el("div", { class: "guide-note", text: localizedText(quest.guideNote, lang) })
    );
  }

  if (quest.steps?.length) {
    container.appendChild(el("h2", { class: "section-title", text: "Pasos" }));

    // Group consecutive steps by their wiki section heading (English on
    // purpose, no new translation cost — see scraper/src/migrate.js).
    const sections = [];
    for (const step of quest.steps) {
      const last = sections[sections.length - 1];
      if (last && last.heading === step.section) last.steps.push(step);
      else sections.push({ heading: step.section, steps: [step] });
    }

    const rows = [];
    sections.forEach((section) => {
      if (section.heading) {
        container.appendChild(el("h3", { class: "step-section-title", text: section.heading }));
      }
      const stepList = el("ul", { class: "step-list" });
      section.steps.forEach((step) => {
        const checked = isCompleted || manualChecks.has(step.index);
        const li = el("li", { class: `indent-${step.indent}${checked ? " checked" : ""}` });
        const checkbox = el("input", { type: "checkbox" });
        checkbox.checked = checked;
        checkbox.disabled = isCompleted;
        li.appendChild(checkbox);
        li.appendChild(el("span", { text: localizedText(step.text, lang) }));
        if (step.chatOptions?.length) {
          li.appendChild(renderChatOptionsButton(step.chatOptions, lang));
        }
        stepList.appendChild(li);
        rows.push({ step, li, checkbox });
      });
      container.appendChild(stepList);
    });

    const setChecked = (row, value) => {
      row.checkbox.checked = value;
      row.li.classList.toggle("checked", value);
      if (value) manualChecks.add(row.step.index);
      else manualChecks.delete(row.step.index);
    };

    rows.forEach((row, i) => {
      row.checkbox.addEventListener("change", () => {
        setChecked(row, row.checkbox.checked);
        // Marcar un paso principal también marca sus sub-pasos/opcionales
        // (los que siguen con más sangría), ya que implica que ese paso completo
        // ya se hizo. No se desmarcan solos al destildar el principal.
        if (row.checkbox.checked && row.step.indent === 0) {
          for (let j = i + 1; j < rows.length && rows[j].step.indent > 0; j++) {
            setChecked(rows[j], true);
          }
        }
        saveManualChecks(quest.id, manualChecks);
      });
    });
  }

  if (quest.rewards?.length) {
    container.appendChild(el("h2", { class: "section-title", text: "Recompensas" }));
    if (quest.rewardBannerImage) {
      container.appendChild(el("img", { class: "reward-banner", src: quest.rewardBannerImage, alt: "" }));
    }
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
}
