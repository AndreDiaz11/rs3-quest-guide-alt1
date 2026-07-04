import { fetchIndex, fetchQuest } from "./dataset.js";
import { renderQuestDetail } from "./detail.js";
import { renderSidebar } from "./sidebar.js";
import { fetchRuneMetricsQuests } from "./runemetrics.js";
import { fetchPlayerLevels } from "./skills.js";
import { matchRuneMetricsToDataset } from "./matching.js";
import { openSettingsModal, loadSettings } from "./settings.js";
import { state, questStatus } from "./state.js";

const filterBarEl = document.getElementById("sidebar-filterbar-slot");
const listEl = document.getElementById("quest-list");
const counterEl = document.getElementById("quest-counter");
const detail = document.getElementById("detail");
const settingsBtn = document.getElementById("settings-btn");

function refreshSidebar() {
  renderSidebar({ filterBarEl, listEl, counterEl }, selectQuest);
}

async function selectQuest(id) {
  state.selectedQuestId = id;
  refreshSidebar();
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

/** Shows a RuneMetrics status message when relevant, otherwise renders the given quest (or the first one). */
function showRuneMetricsResultOrQuest(rmResult, questIdToShow) {
  if (rmResult.fetchFailed) {
    detail.innerHTML =
      '<p id="detail-placeholder">No se pudo consultar RuneMetrics (fallo de red/CORS). Las misiones se muestran sin estado de progreso.</p>';
  } else if (rmResult.invalidOrPrivate && !rmResult.noUsername) {
    detail.innerHTML =
      '<p id="detail-placeholder">No se encontró ese nombre de jugador en RuneMetrics, o su perfil es privado. Revisa el nombre en Ajustes.</p>';
  } else if (questIdToShow) {
    selectQuest(questIdToShow);
  }
}

async function main() {
  state.settings = loadSettings();
  state.index = await fetchIndex();

  settingsBtn.addEventListener("click", () => {
    openSettingsModal({
      datasetLastUpdated: state.index.lastUpdated,
      onSave: async (settings) => {
        state.settings = settings;
        const rmResult = await refreshRuneMetrics();
        refreshSidebar();
        showRuneMetricsResultOrQuest(rmResult, state.selectedQuestId || state.index.quests[0]?.id);
      },
    });
  });

  const rmResult = await refreshRuneMetrics();
  refreshSidebar();
  showRuneMetricsResultOrQuest(rmResult, state.index.quests[0]?.id);
}

main().catch((err) => {
  detail.innerHTML = `<p style="color:#c0392b">Error cargando el dataset: ${err.message}</p>`;
  console.error(err);
});
