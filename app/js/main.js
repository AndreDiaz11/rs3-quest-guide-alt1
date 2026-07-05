import { fetchIndex, fetchQuest } from "./dataset.js";
import { renderQuestDetail } from "./detail.js";
import { renderSidebar } from "./sidebar.js";
import { fetchRuneMetricsQuests } from "./runemetrics.js";
import { fetchPlayerLevels } from "./skills.js";
import { matchRuneMetricsToDataset } from "./matching.js";
import { openSettingsModal, loadSettings, hasSeenWelcome, openWelcomeModal } from "./settings.js";
import { loadSkillIcons } from "./skillIcons.js";
import { state, questStatus } from "./state.js";

const filterBarEl = document.getElementById("sidebar-filterbar-slot");
const listEl = document.getElementById("quest-list");
const counterEl = document.getElementById("quest-counter");
const detail = document.getElementById("detail");
const settingsBtn = document.getElementById("settings-btn");
const sidebarEl = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const sidebarToggle = document.getElementById("sidebar-toggle");

function setSidebarOpen(open) {
  sidebarEl.classList.toggle("open", open);
  sidebarBackdrop.classList.toggle("open", open);
}

sidebarToggle.addEventListener("click", () => {
  setSidebarOpen(!sidebarEl.classList.contains("open"));
});
sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));

function refreshSidebar() {
  renderSidebar({ filterBarEl, listEl, counterEl }, selectQuest);
}

async function selectQuest(id) {
  state.selectedQuestId = id;
  refreshSidebar();
  setSidebarOpen(false); // elegir una misión cierra el cajón — el detalle debe quedar libre para jugar
  detail.innerHTML = '<p id="detail-placeholder">Cargando...</p>';
  try {
    const quest = await fetchQuest(id);
    renderQuestDetail(detail, quest, {
      lang: state.settings.lang,
      isCompleted: questStatus(id) === "COMPLETED",
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

const WELCOME_HTML = `
  <div id="welcome-screen">
    <h1>Quest Compass</h1>
    <p>Elige una misión de la lista para ver su guía completa.</p>
    <p>Para marcar automáticamente las misiones que ya completaste, abre
      <strong>Ajustes (&#9881;)</strong> y escribe tu nombre de jugador de RuneScape.</p>
  </div>
`;

/** Shows a RuneMetrics status message when relevant, otherwise renders the given quest (or a welcome screen on first run). */
function showRuneMetricsResultOrQuest(rmResult, questIdToShow) {
  if (rmResult.fetchFailed) {
    detail.innerHTML =
      '<p id="detail-placeholder">No se pudo consultar RuneMetrics (fallo de red/CORS). Las misiones se muestran sin estado de progreso.</p>';
  } else if (rmResult.invalidOrPrivate && !rmResult.noUsername) {
    detail.innerHTML =
      '<p id="detail-placeholder">No se encontró ese nombre de jugador en RuneMetrics, o su perfil es privado. Revisa el nombre en Ajustes.</p>';
  } else if (rmResult.noUsername && !state.selectedQuestId) {
    detail.innerHTML = WELCOME_HTML;
  } else if (questIdToShow) {
    selectQuest(questIdToShow);
  }
}

function openSettings() {
  openSettingsModal({
    datasetLastUpdated: state.index.lastUpdated,
    onSave: async (settings) => {
      state.settings = settings;
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
  detail.innerHTML = `<p style="color:#c0392b">Error cargando el dataset: ${err.message}</p>`;
  console.error(err);
});
