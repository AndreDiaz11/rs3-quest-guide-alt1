/**
 * Small inline-SVG icon set used by the sidebar (filter chips, per-quest
 * markers, header/footer emblem) — generated here instead of using emoji so
 * colors/sizes match the app's own palette exactly.
 */

function svg(inner, viewBox = "0 0 24 24") {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

/** Small rotated-square "gem" marker shown to the left of each quest title. */
export function diamondIcon(color) {
  return svg(`<rect x="4" y="4" width="16" height="16" rx="3" transform="rotate(45 12 12)" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>`);
}

export function checkCircleIcon(color) {
  return svg(
    `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2"/>` +
      `<path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

export function clockCircleIcon(color) {
  return svg(
    `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2"/>` +
      `<path d="M12 7v5l3.5 2" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

export function xCircleIcon(color) {
  return svg(
    `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2"/>` +
      `<path d="M9 9l6 6M15 9l-6 6" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
  );
}

export function calendarIcon(color) {
  return svg(
    `<rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="${color}" stroke-width="2"/>` +
      `<path d="M3.5 9.5h17" stroke="${color}" stroke-width="2"/>` +
      `<path d="M8 3v4M16 3v4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
  );
}

/** Scroll icon, used for both the "Miniquest" filter chip and the per-row miniquest marker. */
export function scrollIcon(color) {
  return svg(
    `<path d="M6 4.5a2 2 0 100 4h11a1.5 1.5 0 010 3H8" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M6 4.5v15a2 2 0 100-4V8.5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M17 7.5a2 2 0 112 2v9a2 2 0 01-2 2H8" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`
  );
}

/** Regular full quest chip icon: a plainer scroll/tome. */
export function questIcon(color) {
  return svg(
    `<rect x="5" y="3.5" width="14" height="17" rx="1.5" fill="none" stroke="${color}" stroke-width="1.6"/>` +
      `<path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`
  );
}

/** Neutral placeholder shown per-quest before a RuneScape username is configured (no real progress data yet). */
export function unsyncedIcon(color) {
  return svg(
    `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="3 3"/>`
  );
}

/** Right-pointing arrow, used in place of a bare "?" for a requirement whose met/unmet status is unknown (no synced account). */
export function unknownArrowIcon(color) {
  return svg(
    `<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** Gift-box icon, used for the "Rewards" collapsible section heading. */
export function giftIcon(color) {
  return svg(
    `<rect x="4" y="10" width="16" height="10" rx="1" fill="none" stroke="${color}" stroke-width="1.6"/>` +
      `<path d="M4 10h16v3H4z" fill="none" stroke="${color}" stroke-width="1.6"/>` +
      `<path d="M12 10v10" stroke="${color}" stroke-width="1.6"/>` +
      `<path d="M12 10c0-2.5-1.5-4-3-4s-2.5 1.5-1 3c1 1 4 1 4 1zM12 10c0-2.5 1.5-4 3-4s2.5 1.5 1 3c-1 1-4 1-4 1z" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>`
  );
}

/** Compass/star emblem used in the header and footer. */
export function compassIcon(color = "var(--gold-bright)", ringColor = "var(--gold)") {
  return svg(
    `<circle cx="12" cy="12" r="10" fill="none" stroke="${ringColor}" stroke-width="1.4"/>` +
      `<path d="M12 3l1.8 6.6L20.5 12l-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8z" fill="${color}"/>` +
      `<circle cx="12" cy="12" r="1.6" fill="${ringColor}"/>`
  );
}
