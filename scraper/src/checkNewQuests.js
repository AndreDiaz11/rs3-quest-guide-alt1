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

function seccion(titulo, color, items, render, nota) {
  if (items.length === 0) return "";
  const filas = items
    .map((item) => `<li style="margin:0 0 8px;font-size:14px;color:#d8c9a3;">${render(item)}</li>`)
    .join("");
  return `
    <tr>
      <td style="padding:0 28px 24px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:0.5px;">
          ${titulo} (${items.length})
        </p>
        <ul style="margin:0;padding-left:18px;">${filas}</ul>
        ${nota ? `<p style="margin:10px 0 0;font-size:12px;color:#a39372;">${nota}</p>` : ""}
      </td>
    </tr>`;
}

function statPill(valor, label, color) {
  return `
    <td align="center" style="padding:14px 8px;">
      <div style="font-size:22px;font-weight:800;color:${color};">${valor}</div>
      <div style="font-size:11px;color:#a39372;text-transform:uppercase;letter-spacing:0.4px;">${label}</div>
    </td>`;
}

function armarCorreoHtml({ scraped, completed, stillPending, failed }) {
  const fecha = new Date().toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });

  return `
  <div style="background:#211a13;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
      <tr>
        <td>
          <table role="presentation" width="100%" style="border-radius:14px;overflow:hidden;">
            <tr>
              <td align="center" valign="middle" style="background:linear-gradient(120deg,#4a3c28,#171310);height:88px;">
                <span style="font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:20px;letter-spacing:1px;color:#f5d576;">
                  QUEST <span style="color:#e0b84a;">COMPASS</span>
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="margin-top:-64px;">
          <table role="presentation" width="100%" style="background:#171310;border-radius:14px;box-shadow:0 12px 30px -8px rgba(0,0,0,0.5);margin-top:-64px;position:relative;border:1px solid #4a3c28;">
            <tr>
              <td style="padding:28px 28px 4px;">
                <p style="margin:0 0 2px;font-size:16px;font-weight:800;color:#f5d576;text-align:center;">
                  Actividad del scraper de misiones
                </p>
                <p style="margin:0 0 18px;font-size:12px;color:#a39372;text-align:center;">${fecha}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 20px;">
                <table role="presentation" width="100%" style="background:#211a13;border-radius:10px;">
                  <tr>
                    ${statPill(scraped.length, "Nuevas", "#3fce46")}
                    ${statPill(completed.length, "Completadas", "#5bb4e0")}
                    ${statPill(stillPending.length, "Pendientes", "#f0c419")}
                    ${statPill(failed.length, "Fallos", "#ee3b3b")}
                  </tr>
                </table>
              </td>
            </tr>
            ${seccion(
              "Misiones nuevas (en inglés, sin traducir todavía)",
              "#3fce46",
              scraped,
              (t) => t
            )}
            ${seccion("Guía completada (ya estaban pendientes)", "#5bb4e0", completed, (t) => t)}
            ${seccion(
              "Siguen sin guía",
              "#f0c419",
              stillPending,
              (t) => t,
              "Se reintenta automáticamente en cada corrida hasta que la wiki publique la guía."
            )}
            ${seccion(
              "Fallos al scrapear",
              "#ee3b3b",
              failed,
              (f) => `<strong>${f.title}</strong><span style="color:#a39372;"> — ${f.error}</span>`,
              "Revisar manualmente — no es contenido histórico esperado."
            )}
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:20px;">
          <p style="margin:0;font-size:11px;color:#a39372;">Quest Compass · rs3-quest-guide-alt1</p>
        </td>
      </tr>
    </table>
  </div>`;
}

/**
 * Solo se llama cuando hay algo real que reportar (misión nueva, guía
 * completada, o un fallo de scraping genuino) — la mayoría de las corridas
 * de 15 min no encuentran nada y no mandan correo.
 */
export async function sendNotificationEmail({ scraped, completed, stillPending, failed }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) {
    console.log("[check-new-quests] Falta RESEND_API_KEY o NOTIFY_EMAIL — no se envió correo.");
    return;
  }

  const html = armarCorreoHtml({ scraped, completed, stillPending, failed });

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
