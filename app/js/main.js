import { fetchIndex, fetchQuest } from "./dataset.js";
import { renderQuestDetail } from "./detail.js";
import { renderSidebar } from "./sidebar.js";
import { fetchRuneMetricsQuests } from "./runemetrics.js";
import { fetchPlayerLevels } from "./skills.js";
import { matchRuneMetricsToDataset } from "./matching.js";
import { openSettingsModal, loadSettings, hasSeenWelcome, openWelcomeModal } from "./settings.js";
import { loadSkillIcons } from "./skillIcons.js";
import { state, questStatus } from "./state.js";
import { t } from "./i18n.js";
import { normalizeTitle } from "./titleNormalize.js";

const filterBarEl = document.getElementById("sidebar-filterbar-slot");
const listSummaryEl = document.getElementById("quest-list-summary");
const listEl = document.getElementById("quest-list");
const counterEl = document.getElementById("quest-counter");
const detail = document.getElementById("detail");
const settingsBtn = document.getElementById("settings-btn");
const refreshBtn = document.getElementById("refresh-btn");
const sidebarEl = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const sidebarToggle = document.getElementById("sidebar-toggle");

function setSidebarOpen(open) {
  sidebarEl.classList.toggle("open", open);
  sidebarBackdrop.classList.toggle("open", open);
  // The hamburger button floats at the same top-left corner as the sidebar's
  // own header logo — while the drawer is open it sat right on top of the
  // logo (higher z-index), looking like the two icons were overlapping.
  // Only needed to OPEN the drawer; closing already works via the backdrop.
  sidebarToggle.classList.toggle("hidden-while-open", open);
}

function applyChromeLanguage() {
  sidebarToggle.title = t("sidebarToggleTitle");
  sidebarToggle.setAttribute("aria-label", t("sidebarToggleTitle"));
  settingsBtn.title = t("settingsBtnTitle");
  settingsBtn.setAttribute("aria-label", t("settingsBtnTitle"));
  updateRefreshButtonState();
}

// Manual "refresh RuneMetrics now" button, throttled so it can't be spammed —
// re-checking completion status is a real network request, and the game
// itself doesn't update RuneMetrics instantly anyway.
const REFRESH_STORAGE_KEY = "rs3questguide:lastManualRefresh";
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

function updateRefreshButtonState() {
  const last = Number(localStorage.getItem(REFRESH_STORAGE_KEY) || 0);
  const remaining = REFRESH_COOLDOWN_MS - (Date.now() - last);
  if (remaining > 0) {
    refreshBtn.disabled = true;
    refreshBtn.title = t("refreshCooldown", Math.ceil(remaining / 60000));
  } else {
    refreshBtn.disabled = false;
    refreshBtn.title = t("refreshBtnTitle");
  }
}

// Full-screen blocking overlay shown while a manual refresh is in flight —
// the request can take a couple seconds, and clicking around mid-refresh
// (e.g. opening another quest) could race with the re-render below.
let loadingOverlay = null;
function showLoadingOverlay() {
  loadingOverlay = document.createElement("div");
  loadingOverlay.id = "loading-overlay";
  loadingOverlay.innerHTML = `<div class="loading-spinner"></div><div class="loading-text">${t("updatingText")}</div>`;
  document.body.appendChild(loadingOverlay);
}
function hideLoadingOverlay() {
  loadingOverlay?.remove();
  loadingOverlay = null;
}

async function manualRefresh() {
  if (refreshBtn.disabled) return;
  localStorage.setItem(REFRESH_STORAGE_KEY, String(Date.now()));
  updateRefreshButtonState();
  showLoadingOverlay();

  try {
    const rmResult = await refreshRuneMetrics();
    refreshSidebar();
    if (state.selectedQuestId) {
      // Re-render the open quest in place (checkbox/completion state may have
      // changed) without closing the sidebar drawer or touching scroll position.
      try {
        const quest = await fetchQuest(state.selectedQuestId);
        const subquests = await fetchQuestRefs(quest.subquests);
        const bonusQuests = await fetchQuestRefs(quest.bonusQuests);
        renderQuestDetail(detail, quest, {
          lang: state.settings.lang,
          isCompleted: questStatus(state.selectedQuestId) === "COMPLETED",
          subquests,
          bonusQuests,
        });
      } catch (err) {
        console.error("[refresh] fallo al volver a renderizar la misión abierta:", err);
      }
    } else {
      showRuneMetricsResultOrQuest(rmResult, null);
    }
  } finally {
    hideLoadingOverlay();
  }
}

sidebarToggle.addEventListener("click", () => {
  setSidebarOpen(!sidebarEl.classList.contains("open"));
});
refreshBtn.addEventListener("click", manualRefresh);
// Re-checks the cooldown periodically so the button re-enables itself once
// 5 minutes pass, without needing a reload.
setInterval(updateRefreshButtonState, 15000);
sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));

// Alt1 keeps a plugin's tab alive across game sessions for days — without
// this, a quest the 15-min auto-publish workflow adds while the plugin is
// already open would only ever show up after the player manually closes and
// reopens it. Re-fetching index.json (already "no-cache", see dataset.js)
// on the same 15-min cadence as that workflow picks up new/updated quests
// live. Only re-renders the sidebar LIST, never touches whatever quest is
// currently open in the detail panel — a player mid-guide should never have
// their own screen change out from under them.
const DATASET_REFRESH_MS = 15 * 60 * 1000;
async function refreshDatasetIndex() {
  try {
    state.index = await fetchIndex();
    refreshSidebar();
  } catch (err) {
    // Silent — a transient network hiccup here shouldn't interrupt whatever
    // the player is doing; the next scheduled attempt will just try again.
    console.error("[dataset] fallo al refrescar el índice de misiones:", err);
  }
}
setInterval(refreshDatasetIndex, DATASET_REFRESH_MS);

function refreshSidebar() {
  renderSidebar({ filterBarEl, listSummaryEl, listEl, counterEl }, selectQuest);
}

// A hub quest's own `subquests`/`bonusQuests` field (see
// scraper/src/parseMetadata.js) is just an array of exact wiki titles —
// resolved here against our own dataset (same normalizeTitle matching used
// for real requirement checks) and each sub-quest's full data fetched so it
// can be rendered nested, in full, inside the hub's own page (see detail.js's
// renderSubquestBlock).
async function fetchQuestRefs(titles) {
  if (!titles?.length) return [];
  const matches = titles
    .map((title) => state.index.quests.find((q) => normalizeTitle(q.title) === normalizeTitle(title)))
    .filter(Boolean);
  return Promise.all(
    matches.map(async (match) => ({
      id: match.id,
      quest: await fetchQuest(match.id),
      status: questStatus(match.id),
      isCompleted: questStatus(match.id) === "COMPLETED",
    }))
  );
}

async function selectQuest(id) {
  state.selectedQuestId = id;
  refreshSidebar();
  setSidebarOpen(false); // elegir una misión cierra el cajón — el detalle debe quedar libre para jugar
  detail.innerHTML = `<p id="detail-placeholder">${t("loading")}</p>`;
  try {
    const quest = await fetchQuest(id);
    const subquests = await fetchQuestRefs(quest.subquests);
    const bonusQuests = await fetchQuestRefs(quest.bonusQuests);
    renderQuestDetail(detail, quest, {
      lang: state.settings.lang,
      isCompleted: questStatus(id) === "COMPLETED",
      subquests,
      bonusQuests,
    });
  } catch (err) {
    detail.innerHTML = `<p style="color:#c0392b">${err.message}</p>`;
  }
}

async function refreshRuneMetrics() {
  if (!state.settings.username) {
    state.runemetricsStatus = new Map();
    state.playerLevels = null;
    return { noUsername: true };
  }
  try {
    const { quests, invalidOrPrivate, noUsername } = await fetchRuneMetricsQuests(state.settings.username);
    state.runemetricsStatus = await matchRuneMetricsToDataset(quests, state.index.quests);
    try {
      state.playerLevels = await fetchPlayerLevels(state.settings.username);
    } catch (err) {
      console.error("[skills] fallo al consultar niveles del jugador:", err);
      state.playerLevels = null;
    }
    return { invalidOrPrivate, noUsername };
  } catch (err) {
    // Red fetch failure (CORS, sin conexión, etc.) — no debe tumbar la app,
    // solo dejamos el estado de las misiones como "desconocido".
    console.error("[runemetrics] fallo al consultar el estado del jugador:", err);
    state.runemetricsStatus = new Map();
    return { fetchFailed: true };
  }
}

// Shown bilingually on purpose (both ES and EN always, regardless of the
// plugin's own language setting) — same reasoning as the first-run welcome
// popup in settings.js: a brand-new user hasn't necessarily picked a
// language yet, so this one screen shouldn't gate its own instructions
// behind that choice.
function welcomeHtml() {
  return `
  <div id="welcome-screen">
    <h1>Quest Compass</h1>
    <p class="welcome-lang-block"><strong>Español:</strong> Elige una misión de la lista para ver su guía completa. Para marcar automáticamente las misiones que ya completaste, abre <strong>Ajustes (&#9881;)</strong> y escribe tu nombre de jugador de RuneScape.</p>
    <p class="welcome-lang-block"><strong>English:</strong> Pick a quest from the list to see its full guide. To automatically mark quests you've already completed, open <strong>Settings (&#9881;)</strong> and enter your RuneScape username.</p>
  </div>
`;
}

/** Shows a RuneMetrics status message when relevant, otherwise renders the given quest (or a welcome screen on first run). */
function showRuneMetricsResultOrQuest(rmResult, questIdToShow) {
  if (rmResult.fetchFailed) {
    detail.innerHTML = `<p id="detail-placeholder">${t("fetchFailed")}</p>`;
  } else if (rmResult.invalidOrPrivate && !rmResult.noUsername) {
    detail.innerHTML = `<p id="detail-placeholder">${t("invalidOrPrivate")}</p>`;
  } else if (rmResult.noUsername && !state.selectedQuestId) {
    detail.innerHTML = welcomeHtml();
  } else if (questIdToShow) {
    selectQuest(questIdToShow);
  } else {
    detail.innerHTML = `<p id="detail-placeholder">${t("selectAQuest")}</p>`;
  }
}

function openSettings() {
  openSettingsModal({
    datasetLastUpdated: state.index.lastUpdated,
    onSave: async (settings) => {
      state.settings = settings;
      applyChromeLanguage();
      const rmResult = await refreshRuneMetrics();
      refreshSidebar();
      // Solo vuelve a mostrar una misión si ya había una abierta en esta
      // sesión — nunca abre una al azar solo por guardar Ajustes.
      showRuneMetricsResultOrQuest(rmResult, state.selectedQuestId);
    },
  });
}

async function main() {
  state.settings = loadSettings();
  applyChromeLanguage();
  state.index = await fetchIndex();
  await loadSkillIcons();
  setSidebarOpen(true); // abierto al iniciar para poder elegir una misión

  settingsBtn.addEventListener("click", openSettings);

  const rmResult = await refreshRuneMetrics();
  refreshSidebar();
  // Nunca auto-selecciona una misión al iniciar (quedaba siempre abierta en
  // la primera del índice) — el panel de detalle queda vacío hasta que el
  // jugador elige una misión de la lista.
  showRuneMetricsResultOrQuest(rmResult, null);

  if (!state.settings.username && !hasSeenWelcome()) {
    openWelcomeModal({ onOpenSettings: openSettings });
  }
}

main().catch((err) => {
  detail.innerHTML = `<p style="color:#c0392b">${t("datasetLoadError", err.message)}</p>`;
  console.error(err);
});
