// Cloudflare Worker: proxy mínimo y de propósito único para 2 endpoints públicos
// de RuneMetrics (misiones, y perfil/niveles de habilidad). Jagex nunca envía
// cabeceras Access-Control-Allow-Origin en sus APIs (confirmado también dentro
// del navegador embebido de Alt1), así que ningún fetch desde el navegador puede
// leerlas directamente — este worker agrega esa cabecera.
//
// A propósito solo reenvía a estos 2 endpoints conocidos (no es un proxy abierto
// genérico), para minimizar el riesgo de que se use para otra cosa.
//
// Uso: ?user=NOMBRE (misiones, por defecto) | ?user=NOMBRE&type=profile (niveles)
//
// Despliegue: pegar este archivo tal cual en el editor de Cloudflare Workers
// (dashboard.cloudflare.com -> Workers & Pages -> Create -> Edit code), o
// `npx wrangler deploy` desde esta carpeta.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const user = url.searchParams.get("user");
    const type = url.searchParams.get("type") || "quests";

    if (!user) {
      return new Response(JSON.stringify({ error: "Falta el parámetro ?user=" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    const upstreamUrl =
      type === "profile"
        ? `https://apps.runescape.com/runemetrics/profile/profile?user=${encodeURIComponent(user)}&activities=0`
        : `https://apps.runescape.com/runemetrics/quests?user=${encodeURIComponent(user)}`;

    const upstream = await fetch(upstreamUrl);
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  },
};
