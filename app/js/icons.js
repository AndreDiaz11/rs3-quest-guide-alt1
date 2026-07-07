/**
 * Small inline-SVG icon set used by the sidebar's filter/sort bar and the
 * quest detail view's collapsible section headings — generated here instead
 * of using emoji so colors/sizes match the app's own palette exactly.
 */

function svg(inner, viewBox = "0 0 24 24") {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

/** Funnel/filter icon for the sidebar's filter-popover toggle button. */
export function funnelIcon(color) {
  return svg(`<path d="M4 5h16l-6 7.5v5.5l-4 2v-7.5z" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>`);
}

/** Scroll icon, used for the "Guía paso a paso" collapsible section heading. */
export function scrollIcon(color) {
  return svg(
    `<path d="M6 4.5a2 2 0 100 4h11a1.5 1.5 0 010 3H8" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M6 4.5v15a2 2 0 100-4V8.5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M17 7.5a2 2 0 112 2v9a2 2 0 01-2 2H8" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`
  );
}

/** Plain scroll/tome icon, used for the "Resumen" (Overview) collapsible section heading. */
export function questIcon(color) {
  return svg(
    `<rect x="5" y="3.5" width="14" height="17" rx="1.5" fill="none" stroke="${color}" stroke-width="1.6"/>` +
      `<path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`
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
