// Jagex nunca envía cabeceras CORS en sus APIs (confirmado en Alt1 real), así que
// pasamos por un proxy propio (Cloudflare Worker) que sí las agrega.
// Ver worker/runemetrics-proxy.js para el código del proxy.
const RUNEMETRICS_BASE = "https://rs3-runemetrics-proxy.rs3questguide.workers.dev";

/**
 * Fetches quest completion status for a player from the public RuneMetrics
 * API (no login required). Returns { quests, invalidOrPrivate }. RuneMetrics
 * returns an empty array (not an HTTP error) for an unknown username or a
 * profile with RuneMetrics disabled, so that case is surfaced explicitly
 * rather than treated as "zero quests".
 */
export async function fetchRuneMetricsQuests(username) {
  if (!username || !username.trim()) {
    return { quests: [], invalidOrPrivate: false, noUsername: true };
  }

  const url = `${RUNEMETRICS_BASE}?user=${encodeURIComponent(username.trim())}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`RuneMetrics respondió con error (${res.status})`);
  }
  const json = await res.json();

  if (json.error) {
    return { quests: [], invalidOrPrivate: true, noUsername: false };
  }

  const quests = Array.isArray(json.quests) ? json.quests : [];
  return { quests, invalidOrPrivate: quests.length === 0, noUsername: false };
}
