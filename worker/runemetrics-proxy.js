// Cloudflare Worker: proxy mínimo y de propósito único para el endpoint público de
// RuneMetrics. Jagex nunca envía cabeceras Access-Control-Allow-Origin en sus APIs
// (confirmado también dentro del navegador embebido de Alt1), así que ningún fetch
// desde el navegador puede leerlas directamente — este worker agrega esa cabecera.
//
// A propósito solo reenvía a este único endpoint (no es un proxy abierto genérico),
// para minimizar el riesgo de que se use para otra cosa.
//
// Despliegue: pegar este archivo tal cual en el editor de Cloudflare Workers
// (dashboard.cloudflare.com -> Workers & Pages -> Create -> Edit code).

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

    if (!user) {
      return new Response(JSON.stringify({ error: "Falta el parámetro ?user=" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    const upstream = await fetch(
      `https://apps.runescape.com/runemetrics/quests?user=${encodeURIComponent(user)}`
    );
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  },
};
