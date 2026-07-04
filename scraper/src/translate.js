import { readFile } from "node:fs/promises";

const glossaryPath = new URL("./glossary.json", import.meta.url);
const ANTHROPIC_MODEL = "claude-sonnet-5";

async function loadGlossary() {
  const raw = await readFile(glossaryPath, "utf8");
  return JSON.parse(raw);
}

async function callTranslateApi(strings, glossary, apiKey) {
  const systemPrompt = `Eres un traductor especializado en RuneScape 3 (RS3), un MMORPG. Traduces texto de guías de misiones del inglés al español de España, manteniendo un tono claro y natural para jugadores hispanohablantes.

Reglas:
- RS3 NO tiene cliente oficial en español; no existe una localización "oficial" que seguir. Usa las traducciones de habilidades del glosario adjunto de forma consistente.
- Los nombres propios (NPCs, lugares) se mantienen en inglés tal cual aparecen, salvo que el glosario indique una traducción explícita. Los nombres de objetos/items también se dejan en inglés (así aparecen en el juego, que no tiene cliente en español).
- Traduce el resto del texto de forma natural, no literal palabra por palabra. ESTO INCLUYE los fragmentos entre paréntesis "(opciones de chat: ...)": son opciones de diálogo citadas del juego y DEBEN traducirse igual que el resto del texto, no dejarlas en inglés. Ejemplo: "(opciones de chat: 1 Talk about the quest. • Accept)" -> "(opciones de chat: 1 Hablar sobre la misión. • Aceptar)".
- Devuelve EXACTAMENTE el mismo número de líneas que la entrada, una traducción por línea, en el mismo orden, sin numerar ni añadir texto extra ni comentarios.
- Es muy importante que no omitas ni fusiones ninguna línea, incluso si el texto es muy largo: cada línea de entrada debe producir exactamente una línea de salida.

Glosario de habilidades:
${JSON.stringify(glossary.skills, null, 2)}

Otros términos:
${JSON.stringify(glossary.terms, null, 2)}`;

  const userPrompt = strings.map((s, i) => `${i + 1}: ${s}`).join("\n");

  // Generous headroom: this model may spend part of max_tokens on internal
  // "thinking" content before the actual text block, so a tight budget
  // truncates the translation on longer quests (some have 100+ steps).
  const maxTokens = Math.min(32000, Math.max(4096, strings.length * 200));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API request failed (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  // The response can include a "thinking" block before the actual "text" block
  // (extended thinking), so find the text block by type rather than assuming index 0.
  const textBlock = json.content?.find((block) => block.type === "text");
  const text = textBlock?.text || "";
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+:\s?/, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Translates an ordered list of English strings to Spanish in one request,
 * so the model has full quest context for tone/pronoun consistency. Validates
 * that the returned array length matches the input before accepting it,
 * retrying once on a mismatch before giving up.
 */
export async function translateStrings(strings) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY no está configurada. Corre con --skip-translate para omitir este paso, " +
        "o define la key en scraper/.env (ver .env.example)."
    );
  }
  if (strings.length === 0) return [];

  const glossary = await loadGlossary();

  for (let attempt = 1; attempt <= 2; attempt++) {
    const lines = await callTranslateApi(strings, glossary, apiKey);
    if (lines.length === strings.length) return lines;
    if (attempt === 2) {
      throw new Error(
        `Desalineación en la traducción tras reintento: se esperaban ${strings.length} líneas, se recibieron ${lines.length}.`
      );
    }
  }
}
