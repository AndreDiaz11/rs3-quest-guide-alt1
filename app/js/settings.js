const SETTINGS_KEY = "rs3questguide:settings";

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
  modal.innerHTML = `
    <h2>Ajustes</h2>
    <label>
      Usuario de RuneScape (RSN)
      <input type="text" id="settings-username" value="${current.username.replace(/"/g, "&quot;")}" placeholder="Tu nombre de jugador" />
    </label>
    <label>
      Idioma de las guías
      <select id="settings-lang">
        <option value="es" ${current.lang === "es" ? "selected" : ""}>Español</option>
        <option value="en" ${current.lang === "en" ? "selected" : ""}>English (original)</option>
      </select>
    </label>
    <p class="settings-updated">
      Última actualización del dataset: ${datasetLastUpdated ? new Date(datasetLastUpdated).toLocaleString("es-ES") : "desconocida"}
    </p>
    <div class="settings-actions">
      <button id="settings-cancel">Cancelar</button>
      <button id="settings-save">Guardar</button>
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
