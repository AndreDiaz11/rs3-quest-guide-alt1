import { meetsQuestRequirement, meetsSkillRequirement } from "./state.js";
import { getSkillIcon } from "./skillIcons.js";

function localizedText(field, lang) {
  if (!field) return "";
  return field[lang] || field.en || "";
}

// Fairy ring teleport codes only ever use these 12 letters (two dials of six
// each), so matching runs made up of just these characters is safe — real
// words in guide text don't collide with this alphabet.
const FAIRY_CODE_RE = /\b([AIDKBCJLPQRS]{2,4})\b/g;

/**
 * Appends `text` to `parent`, rendering fairy ring codes (e.g. "DKQ") in bold
 * with letter-spacing so they stand out like the wiki's own stylized
 * lettering, instead of blending into the sentence as plain text.
 */
function appendTextWithFairyCodes(parent, text) {
  let lastIndex = 0;
  let match;
  FAIRY_CODE_RE.lastIndex = 0;
  while ((match = FAIRY_CODE_RE.exec(text)) !== null) {
    // Only treat it as a fairy ring code next to "fairy ring"/"anillo de
    // hadas" or right at the start of the step followed by a comma — avoids
    // bolding an unrelated all-caps word that happens to use these letters.
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 2);
    const nearFairyRing = /fairy ring\s*$|anillo de (?:las? )?hadas\s*$/i.test(before);
    const atStart = match.index === 0 && after.startsWith(",");
    if (!nearFairyRing && !atStart) continue;

    parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    parent.appendChild(el("b", { class: "fairy-code", text: match[1] }));
    lastIndex = match.index + match[0].length;
  }
  parent.appendChild(document.createTextNode(text.slice(lastIndex)));
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

function renderItemRow(item) {
  const li = el("li");
  if (item.image) li.appendChild(el("img", { src: item.image, alt: item.name }));
  li.appendChild(document.createTextNode(item.display || item.name));
  return li;
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

/**
 * Renders one quest-requirement node and, recursively, its own prerequisites
 * underneath it staggered one step further right — matching the wiki's own
 * indented requirement tree (e.g. Children of Mah -> The Light Within ->
 * Meeting History / The Temple at Senntisten / ...).
 */
function renderRequirementNode(node) {
  const li = el("li");
  li.appendChild(requirementMarker(meetsQuestRequirement(node.title)));
  li.appendChild(document.createTextNode(" " + node.title));
  if (node.children?.length) {
    const childUl = el("ul", { class: "requirement-tree" });
    node.children.forEach((child) => childUl.appendChild(renderRequirementNode(child)));
    li.appendChild(childUl);
  }
  return li;
}

function renderRequirementsList(quest) {
  const wrap = el("div", { class: "requirements-list" });

  const skills = quest.requirements?.skills || [];
  const quests = quest.requirements?.quests || [];
  if (skills.length === 0 && quests.length === 0) return null;

  if (quests.length > 0) {
    const ul = el("ul", { class: "requirement-tree" });
    quests.forEach((node) => ul.appendChild(renderRequirementNode(node)));
    wrap.appendChild(ul);
  }

  if (skills.length > 0) {
    const ul = el("ul", { class: `requirement-items${quests.length > 0 ? " requirement-skills-gap" : ""}` });
    skills.forEach((req) => {
      const li = el("li");
      li.appendChild(requirementMarker(meetsSkillRequirement(req)));
      const icon = getSkillIcon(req.skill);
      if (icon) li.appendChild(el("img", { class: "req-skill-icon", src: icon, alt: req.skill }));
      li.appendChild(document.createTextNode(` ${req.skill} ${req.level}`));
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  }

  return wrap;
}

/** Extracts just the marker shown inline next to the chat bubble (e.g. "1", "#", "~" for "Any"). */
function chatOptionMarker(opt) {
  const match = opt.match(/^([#?\d]+)\s+/);
  if (match) return match[1];
  const lower = opt.trim().toLowerCase();
  if (lower === "any") return "~";
  if (lower === "accept") return "✓";
  // Options with no leading marker at all (e.g. "Yes.") use "?" like the
  // other undetermined-position markers — using "•" here collided visually
  // with the "•" that joins markers together (e.g. "1•••5" instead of a
  // single clean separator).
  return "?";
}

/**
 * A popup line matching the wiki's own plain style: bold marker (no period),
 * plain dialogue text (no quotes/italics) — the previous quoted-italic look
 * didn't match the wiki at all.
 */
function renderChatOptionLine(opt) {
  const li = el("li");
  const match = opt.match(/^([#?\d]+)\s+(.+)$/);
  const lower = opt.trim().toLowerCase();
  if (match) {
    const [, marker, dialogue] = match;
    li.appendChild(el("span", { class: "chat-opt-num", text: marker }));
    li.appendChild(document.createTextNode(" " + dialogue));
  } else if (lower === "any") {
    // Matches the wiki's own literal "~ [Any option]" notation.
    li.appendChild(el("span", { class: "chat-opt-num", text: "~" }));
    li.appendChild(document.createTextNode(" [Any option]"));
  } else if (lower === "accept") {
    li.appendChild(el("span", { class: "chat-opt-num", text: "✓" }));
    li.appendChild(document.createTextNode(" [Accept Quest]"));
  } else {
    li.appendChild(document.createTextNode(opt));
  }
  return li;
}

function openChatOptionsPopup(anchorEl, options) {
  const existing = document.querySelector(".chat-options-popup");
  existing?.remove();
  if (existing && existing.dataset.forBtn === anchorEl.dataset.chatBtnId) return; // clicking the same anchor again just closes it

  const popup = el("div", { class: "chat-options-popup" });
  const list = el("ul");
  options.forEach((opt) => list.appendChild(renderChatOptionLine(opt)));
  popup.appendChild(list);
  const close = el("button", { class: "chat-options-close", type: "button", text: "✕" });
  close.addEventListener("click", () => popup.remove());
  popup.appendChild(close);

  const btnId = String(Date.now());
  anchorEl.dataset.chatBtnId = btnId;
  popup.dataset.forBtn = btnId;

  document.body.appendChild(popup);
  const rect = anchorEl.getBoundingClientRect();
  const maxLeft = window.innerWidth - popup.offsetWidth - 8;
  popup.style.top = `${rect.bottom + 6}px`;
  popup.style.left = `${Math.min(rect.left, maxLeft)}px`;
}

/**
 * Renders the wiki's own inline chat-options summary right after the step's
 * sentence: "(💬 1•2•1•3•1) ..." — a chat bubble + each option's marker
 * joined by "•", followed by a small "..." button that opens the full popup.
 */
function renderChatOptionsSummary(options) {
  const wrap = el("span", { class: "chat-options-summary" });
  wrap.appendChild(el("span", { class: "chat-options-icon", text: "💬" }));
  wrap.appendChild(document.createTextNode(" " + options.map(chatOptionMarker).join("•")));

  const more = el("button", { class: "chat-options-more", type: "button", title: "Opciones de chat", text: "..." });
  more.addEventListener("click", () => openChatOptionsPopup(more, options));

  const outer = el("span", { class: "chat-options-inline" });
  outer.appendChild(document.createTextNode("("));
  outer.appendChild(wrap);
  outer.appendChild(document.createTextNode(")"));
  outer.appendChild(document.createTextNode(" "));
  outer.appendChild(more);
  return outer;
}

/**
 * Renders a step's text and (if any) its inline chat-options summary as ONE
 * wrapping unit. They must be siblings inside a single non-flex container —
 * putting them as separate flex-item siblings of the parent `<li>` (flex,
 * for the checkbox) made the chat marker sit beside the FIRST line of a
 * wrapped multi-line sentence instead of flowing after its last word.
 */
function renderStepContent(step, lang) {
  const wrap = el("span", { class: "step-text" });
  appendTextWithFairyCodes(wrap, localizedText(step.text, lang));
  if (step.chatOptions?.length) {
    wrap.appendChild(renderChatOptionsSummary(step.chatOptions));
  }
  return wrap;
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
    const itemsList = el("ul", { class: "items-plain-list" });
    quest.items.forEach((item) => itemsList.appendChild(renderItemRow(item)));
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
        // "*: " notes from the wiki (e.g. "If done correctly, you receive a
        // wrinkly scroll.") are informational, not an actual action to take —
        // shown without a checkbox, matching how the wiki itself displays them.
        if (step.isNote) {
          const li = el("li", { class: `step-note indent-${step.indent}` });
          li.appendChild(renderStepContent(step, lang));
          stepList.appendChild(li);
          return;
        }

        const checked = isCompleted || manualChecks.has(step.index);
        const li = el("li", { class: `indent-${step.indent}${checked ? " checked" : ""}` });
        const checkbox = el("input", { type: "checkbox" });
        checkbox.checked = checked;
        checkbox.disabled = isCompleted;
        li.appendChild(checkbox);
        li.appendChild(renderStepContent(step, lang));
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
