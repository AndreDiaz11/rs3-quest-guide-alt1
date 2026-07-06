// En producción esto apuntará a jsDelivr (cdn.jsdelivr.net/gh/USER/REPO@TAG/data/...),
// ver Milestone 2. Para desarrollo local usamos una ruta relativa al repo.
const DATA_BASE = "../data";

// "no-cache" forces a revalidation request (ETag/Last-Modified) on every load
// instead of trusting a blind local cache — Alt1's embedded browser keeps a
// plugin's tab alive across game sessions for days, so a fetch that just
// trusted its own cache could keep showing data from before the last deploy
// indefinitely, never picking up dataset fixes until something else forced
// a hard reload.
const FETCH_OPTS = { cache: "no-cache" };

export async function fetchIndex() {
  const res = await fetch(`${DATA_BASE}/index.json`, FETCH_OPTS);
  if (!res.ok) throw new Error(`No se pudo cargar index.json (${res.status})`);
  return res.json();
}

export async function fetchQuest(id) {
  const res = await fetch(`${DATA_BASE}/quests/${id}.json`, FETCH_OPTS);
  if (!res.ok) throw new Error(`No se pudo cargar la guía de "${id}" (${res.status})`);
  return res.json();
}
