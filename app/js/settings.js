import { t } from "./i18n.js";

const SETTINGS_KEY = "rs3questguide:settings";
const WELCOME_SHOWN_KEY = "rs3questguide:welcomeShown";

const DEFAULT_SETTINGS = { username: "", lang: "es" };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Opens the settings modal. `onSave` is called with the new settings object
 * once the user confirms; `datasetLastUpdated` is shown read-only.
 */
export function openSettingsModal({ datasetLastUpdated, onSave }) {
  const current = loadSettings();

  const overlay = document.createElement("div");
  overlay.id = "settings-overlay";

  const modal = document.createElement("div");
  modal.id = "settings-modal";
  // Las etiquetas de las opciones del selector de idioma siempre muestran
  // ambos nombres (con bandera) sin importar el idioma activo — el usuario
  // necesita poder identificar a qué idioma está cambiando ANTES de elegirlo.
  modal.innerHTML = `
    <h2>${t("settingsTitle")}</h2>
    <label>
      ${t("settingsUsernameLabel")}
      <input type="text" id="settings-username" value="${current.username.replace(/"/g, "&quot;")}" placeholder="${t("settingsUsernamePlaceholder")}" />
    </label>
    <label>
      ${t("settingsLangLabel")}
      <select id="settings-lang">
        <option value="es" ${current.lang === "es" ? "selected" : ""}>[ES] Español / Spanish</option>
        <option value="en" ${current.lang === "en" ? "selected" : ""}>[EN] English / Inglés</option>
      </select>
    </label>
    <p class="settings-updated">
      ${t(
        "settingsDatasetUpdated",
        datasetLastUpdated
          ? new Date(datasetLastUpdated).toLocaleString(current.lang === "en" ? "en-GB" : "es-ES")
          : t("settingsDatasetUnknown")
      )}
    </p>
    <div class="settings-actions">
      <button id="settings-cancel">${t("settingsCancel")}</button>
      <button id="settings-save">${t("settingsSave")}</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector("#settings-cancel").addEventListener("click", close);
  modal.querySelector("#settings-save").addEventListener("click", () => {
    const username = modal.querySelector("#settings-username").value.trim();
    const lang = modal.querySelector("#settings-lang").value;
    const settings = { username, lang };
    saveSettings(settings);
    close();
    onSave(settings);
  });
}

/** Whether the first-run welcome popup has already been shown/dismissed on this device. */
export function hasSeenWelcome() {
  return localStorage.getItem(WELCOME_SHOWN_KEY) === "1";
}

function markWelcomeSeen() {
  localStorage.setItem(WELCOME_SHOWN_KEY, "1");
}

/**
 * First-run popup (bilingual): prompts a brand-new user to set their RSN in
 * Ajustes so their quest progress syncs. Shown once per device/browser.
 */
export function openWelcomeModal({ onOpenSettings }) {
  const overlay = document.createElement("div");
  overlay.id = "settings-overlay";

  const modal = document.createElement("div");
  modal.id = "settings-modal";
  modal.innerHTML = `
    <h2>Quest Compass</h2>
    <p class="welcome-lang-block">
      <strong>English:</strong> Before your quest progress can sync, open
      <strong>Settings (&#9881;)</strong> and enter your RuneScape account name.
    </p>
    <p class="welcome-lang-block">
      <strong>Español:</strong> Para que tu progreso de misiones se sincronice, abre
      <strong>Ajustes (&#9881;)</strong> y escribe el nombre de tu cuenta de RuneScape.
    </p>
    <div class="settings-actions">
      <button id="welcome-dismiss">Cerrar / Close</button>
      <button id="welcome-open-settings">Ajustes / Settings</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    markWelcomeSeen();
    overlay.remove();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector("#welcome-dismiss").addEventListener("click", close);
  modal.querySelector("#welcome-open-settings").addEventListener("click", () => {
    close();
    onOpenSettings();
  });
}
