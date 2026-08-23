import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchQuestList, fetchAllQuestTitles } from "./fetchQuestList.js";
import { fetchSeasonalQuestTitles } from "./fetchSeasonalList.js";
import { scrapeOne } from "./run.js";
import { titleToSlug } from "./slug.js";

const INDEX_PATH = fileURLToPath(new URL("../../data/index.json", import.meta.url));
const SUMMARY_PATH = fileURLToPath(new URL("../new-quests-summary.txt", import.meta.url));

// Mensaje exacto que lanza scrapeOne (run.js) para contenido histórico/eliminado
// que la wiki todavía lista en sus categorías pero nunca se va a agregar al
// dataset — esto se repite EN CADA CORRIDA de 15 min por diseño (no hay un set
// persistente de "ya visto"), así que nunca debe contar como fallo real ni
// disparar un correo.
const EXPECTED_EXCLUSION_MESSAGE = "Contenido histórico/eliminado del juego, no una misión jugable actual — excluida a propósito.";

/**
 * Automated check (see .github/workflows/check-new-quests.yml, runs every 15
 * min): finds quest pages on the wiki that aren't in our dataset yet, and
 * scrapes them in English only (skipTranslate — free, no Anthropic API
 * usage). Never translates existing, already-translated content. Pushes
 * straight to main (no PR) — safe because `scrapeOne` degrades gracefully
 * (isPending) rather than failing when a brand-new quest's own Quick guide
 * page hasn't been written yet.
 *
 * Two detection sources, since neither alone covers every case:
 * - Category:Quick guides (fetchQuestList) — catches anything with a
 *   walkthrough already, including miniquests/sagas (not in Category:Quests).
 * - Category:Quests (fetchAllQuestTitles) — catches a brand-new FULL quest
 *   the moment its own page exists, even before a Quick guide is written.
 *
 * Plus a retry pass: any quest already in the dataset flagged `isPending`
 * (no Quick guide yet, from a previous run) gets re-scraped every time this
 * runs, so it fills in automatically the moment the wiki adds the guide —
 * with no need to re-detect it as "new".
 */
async function main() {
  const index = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  const knownIds = new Set(index.quests.map((q) => q.id));

  const [guideTitles, allQuestTitles] = await Promise.all([fetchQuestList(), fetchAllQuestTitles()]);
  const combinedTitles = new Set([...guideTitles, ...allQuestTitles]);
  const newTitles = [...combinedTitles].filter((title) => {
    const slug = titleToSlug(title.replace(/\/Quick guide$/, ""));
    return !knownIds.has(slug);
  });

  const pendingTitles = index.quests.filter((q) => q.isPending).map((q) => q.title);

  if (newTitles.length === 0 && pendingTitles.length === 0) {
    console.log("[check-new-quests] No hay misiones nuevas ni pendientes de completar.");
    await writeFile(SUMMARY_PATH, "");
    return;
  }

  if (newTitles.length > 0) {
    console.log(`[check-new-quests] ${newTitles.length} misión(es) nueva(s) encontrada(s):`);
    newTitles.forEach((t) => console.log(`  - ${t}`));
  }
  if (pendingTitles.length > 0) {
    console.log(`[check-new-quests] ${pendingTitles.length} misión(es) pendiente(s) de guía, reintentando:`);
    pendingTitles.forEach((t) => console.log(`  - ${t}`));
  }

  const seasonalTitles = await fetchSeasonalQuestTitles();
  const scraped = [];
  const completed = [];
  const stillPending = [];
  const failed = [];
  const excludedAsExpected = [];
  for (const title of newTitles) {
    try {
      const record = await scrapeOne(title, { skipTranslate: true }, seasonalTitles);
      scraped.push(title);
      if (record.isPending) stillPending.push(title);
    } catch (err) {
      console.error(`[skip] ${title}: ${err.message}`);
      if (err.message === EXPECTED_EXCLUSION_MESSAGE) excludedAsExpected.push(title);
      else failed.push({ title, error: err.message });
    }
  }
  for (const title of pendingTitles) {
    try {
      const record = await scrapeOne(title, { skipTranslate: true }, seasonalTitles);
      if (record.isPending) stillPending.push(title);
      else completed.push(title);
    } catch (err) {
      console.error(`[skip] ${title}: ${err.message}`);
      if (err.message === EXPECTED_EXCLUSION_MESSAGE) excludedAsExpected.push(title);
      else failed.push({ title, error: err.message });
    }
  }

  const lines = [];
  if (scraped.length > 0) {
    lines.push(`Misiones nuevas scrapeadas en inglés (sin traducir todavía):`, ...scraped.map((t) => `- ${t}`), "");
  }
  if (completed.length > 0) {
    lines.push(`Guía completada para misiones que estaban pendientes:`, ...completed.map((t) => `- ${t}`), "");
  }
  if (stillPending.length > 0) {
    lines.push(`Siguen sin guía (se reintentará automáticamente):`, ...stillPending.map((t) => `- ${t}`), "");
  }
  if (failed.length > 0) {
    lines.push(`No se pudieron scrapear (revisar manualmente):`, ...failed.map((f) => `- ${f.title}: ${f.error}`));
  }
  if (excludedAsExpected.length > 0) {
    lines.push(
      "",
      `Contenido histórico/eliminado detectado por la wiki, excluido a propósito (no cuenta como fallo):`,
      ...excludedAsExpected.map((t) => `- ${t}`)
    );
  }
  await writeFile(SUMMARY_PATH, lines.join("\n"));

  // excludedAsExpected NUNCA cuenta aquí — reaparece en cada corrida de 15 min
  // por diseño (ver EXPECTED_EXCLUSION_MESSAGE), así que mandaría correo cada
  // 15 min para siempre si se incluyera.
  if (scraped.length > 0 || completed.length > 0 || failed.length > 0) {
    await sendNotificationEmail({ scraped, completed, stillPending, failed });
  }
}

/**
 * Solo se llama cuando hay algo real que reportar (misión nueva, guía
 * completada, o un fallo de scraping) — la mayoría de las corridas de 15 min
 * no encuentran nada y no mandan correo.
 */
async function sendNotificationEmail({ scraped, completed, stillPending, failed }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) {
    console.log("[check-new-quests] Falta RESEND_API_KEY o NOTIFY_EMAIL — no se envió correo.");
    return;
  }

  const section = (title, items, render) =>
    items.length === 0
      ? ""
      : `<h3>${title}</h3><ul>${items.map((item) => `<li>${render(item)}</li>`).join("")}</ul>`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <h2>Quest Compass — actividad detectada</h2>
      ${section("Misiones nuevas (en inglés, sin traducir todavía)", scraped, (t) => t)}
      ${section("Guía completada (ya estaban pendientes)", completed, (t) => t)}
      ${section("Siguen sin guía (se reintenta solo)", stillPending, (t) => t)}
      ${section("Fallos al scrapear", failed, (f) => `${f.title}: ${f.error}`)}
      <p style="color:#888; font-size: 12px;">Corrida automática cada 15 min vía GitHub Actions.</p>
    </div>
  `;

  const subject =
    failed.length > 0
      ? `⚠️ Quest Compass: ${failed.length} fallo(s) al scrapear`
      : `Quest Compass: ${scraped.length + completed.length} misión(es) nueva(s)/completada(s)`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Quest Compass <onboarding@resend.dev>",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    console.error(`[check-new-quests] Error al enviar correo: ${res.status} ${await res.text()}`);
  } else {
    console.log("[check-new-quests] Correo de notificación enviado.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
