import { state } from "./state.js";

/**
 * All of the plugin's OWN chrome text (buttons, labels, messages) — separate
 * from quest content, which already has its own {en, es} translation per
 * field. Two things stay in English regardless of this setting, on purpose:
 * wiki step-section headings (e.g. "Walkthrough") and chat-option markers
 * (e.g. "1", "Accept", "~") — the former to avoid new translation cost, the
 * latter because they're literal in-game UI buttons RS3 never localized.
 */
const STRINGS = {
  es: {
    searchPlaceholder: "Buscar misión...",
    chipQuest: "Quest",
    chipComplete: "Completa",
    chipMiniquest: "Miniquest",
    chipInProgress: "En curso",
    chipEvents: "Eventos",
    chipIncomplete: "Incompleta",
    noResults: "Sin resultados.",
    counterConfigure: "Configura tu usuario en <strong>Ajustes</strong> para ver tu progreso",
    counterLabel: "Puntos de misión",
    counterRemaining: (n) => `(quedan ${n})`,
    loading: "Cargando...",
    selectAQuest: "Selecciona una misión.",
    guideUpdated: (date) => `Guía actualizada: ${date}`,
    seasonalBanner: "🎉 Misión de temporada: solo se puede jugar mientras el evento correspondiente está activo en el juego.",
    metaStartPoint: "Punto de inicio",
    metaSeries: "Serie",
    metaAge: "Edad",
    metaMembers: "Miembros",
    metaYes: "Sí",
    metaNo: "No",
    metaLength: "Longitud",
    metaCombatLevel: "Nivel de combate",
    metaReleaseDate: "Fecha de lanzamiento",
    sectionRequirements: "Requisitos",
    sectionItems: "Items requeridos",
    sectionSteps: "Pasos",
    sectionRewards: "Recompensas",
    sectionPostQuest: "Recompensas adicionales (reclamo manual)",
    zoomImage: "Ampliar imagen",
    chatOptionsTitle: "Opciones de chat",
    fetchFailed: "No se pudo consultar RuneMetrics (fallo de red/CORS). Las misiones se muestran sin estado de progreso.",
    invalidOrPrivate: "No se encontró ese nombre de jugador en RuneMetrics, o su perfil es privado. Revisa el nombre en Ajustes.",
    datasetLoadError: (msg) => `Error cargando el dataset: ${msg}`,
    welcomeTitle: "Quest Compass",
    welcomeIntro: "Elige una misión de la lista para ver su guía completa.",
    welcomeSyncHint:
      'Para marcar automáticamente las misiones que ya completaste, abre <strong>Ajustes (&#9881;)</strong> y escribe tu nombre de jugador de RuneScape.',
    settingsTitle: "Ajustes",
    settingsUsernameLabel: "Usuario de RuneScape (RSN)",
    settingsUsernamePlaceholder: "Tu nombre de jugador",
    settingsLangLabel: "Idioma del plugin",
    settingsDatasetUpdated: (date) => `Última actualización del dataset: ${date}`,
    settingsDatasetUnknown: "desconocida",
    settingsCancel: "Cancelar",
    settingsSave: "Guardar",
    sidebarToggleTitle: "Mostrar/ocultar lista de misiones",
    settingsBtnTitle: "Ajustes",
  },
  en: {
    searchPlaceholder: "Search quest...",
    chipQuest: "Quest",
    chipComplete: "Complete",
    chipMiniquest: "Miniquest",
    chipInProgress: "In Progress",
    chipEvents: "Events",
    chipIncomplete: "Incomplete",
    noResults: "No results.",
    counterConfigure: "Set your username in <strong>Settings</strong> to see your progress",
    counterLabel: "Quest points",
    counterRemaining: (n) => `(${n} left)`,
    loading: "Loading...",
    selectAQuest: "Select a quest.",
    guideUpdated: (date) => `Guide updated: ${date}`,
    seasonalBanner: "🎉 Seasonal quest: only playable while the corresponding event is active in-game.",
    metaStartPoint: "Start point",
    metaSeries: "Series",
    metaAge: "Age",
    metaMembers: "Members",
    metaYes: "Yes",
    metaNo: "No",
    metaLength: "Length",
    metaCombatLevel: "Combat level",
    metaReleaseDate: "Release date",
    sectionRequirements: "Requirements",
    sectionItems: "Items required",
    sectionSteps: "Steps",
    sectionRewards: "Rewards",
    sectionPostQuest: "Additional rewards (manual claim)",
    zoomImage: "Enlarge image",
    chatOptionsTitle: "Chat options",
    fetchFailed: "Couldn't reach RuneMetrics (network/CORS failure). Quests are shown without progress status.",
    invalidOrPrivate: "That player name wasn't found on RuneMetrics, or their profile is private. Check the name in Settings.",
    datasetLoadError: (msg) => `Error loading the dataset: ${msg}`,
    welcomeTitle: "Quest Compass",
    welcomeIntro: "Pick a quest from the list to see its full guide.",
    welcomeSyncHint:
      'To automatically mark quests you\'ve already completed, open <strong>Settings (&#9881;)</strong> and enter your RuneScape username.',
    settingsTitle: "Settings",
    settingsUsernameLabel: "RuneScape username (RSN)",
    settingsUsernamePlaceholder: "Your character name",
    settingsLangLabel: "Plugin language",
    settingsDatasetUpdated: (date) => `Dataset last updated: ${date}`,
    settingsDatasetUnknown: "unknown",
    settingsCancel: "Cancel",
    settingsSave: "Save",
    sidebarToggleTitle: "Show/hide quest list",
    settingsBtnTitle: "Settings",
  },
};

/** Looks up a UI string in the plugin's current language (state.settings.lang), falling back to Spanish. */
export function t(key, ...args) {
  const lang = state.settings?.lang === "en" ? "en" : "es";
  const entry = STRINGS[lang][key] ?? STRINGS.es[key];
  return typeof entry === "function" ? entry(...args) : entry;
}
