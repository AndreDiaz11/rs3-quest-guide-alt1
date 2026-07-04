// En producción esto apuntará a jsDelivr (cdn.jsdelivr.net/gh/USER/REPO@TAG/data/...),
// ver Milestone 2. Para desarrollo local usamos una ruta relativa al repo.
const DATA_BASE = "../data";

export async function fetchIndex() {
  const res = await fetch(`${DATA_BASE}/index.json`);
  if (!res.ok) throw new Error(`No se pudo cargar index.json (${res.status})`);
  return res.json();
}

export async function fetchQuest(id) {
  const res = await fetch(`${DATA_BASE}/quests/${id}.json`);
  if (!res.ok) throw new Error(`No se pudo cargar la guía de "${id}" (${res.status})`);
  return res.json();
}
