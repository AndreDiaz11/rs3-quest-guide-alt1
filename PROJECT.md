# Quest Compass — Alt1 Plugin para RS3

## Qué es
Plugin para Alt1 Toolkit (overlay de RuneScape 3) que muestra una guía de misiones estilo wiki
directamente sobre el juego: lista completa de misiones/minimisiones con su estado real de la cuenta
(RuneMetrics), y el detalle de cada una con requisitos, items, pasos y recompensas traducidos al
español. Cero servidor propio que mantener — todo es estático (GitHub Pages) más un proxy CORS
mínimo en Cloudflare Workers para los 2 endpoints públicos de RuneMetrics.

## Cómo se ve y funciona
Panel de dos columnas dentro de Alt1. A la izquierda, sidebar con buscador, un popover de Filter
(mostrar completadas/quests/miniquests, combinables) y un dropdown de Sort con 4 modos (alfabético,
Free/Members, longitud, progreso), más la lista de misiones con un rombo de color + ícono de estado
por fila. Al hacer clic en una misión, el panel derecho muestra su guía completa al estilo de la wiki:
cabecera, metadatos, requisitos con ✓/✗ contra el progreso y nivel real del jugador, items (en chips y
en lista), pasos agrupados por sección con checkboxes (auto-marcados si la misión ya está completa) y
botón de opciones de chat por paso (popup flotante con formato de diálogo), tablas de solución de
puzzles con celdas bloqueadas resaltadas y tamaño fijo cuando corresponde, y las recompensas al final
con la imagen del banner de la wiki.

## Stack
- `app/` — HTML/CSS/JS plano, sin build step, ES modules nativos.
- `scraper/` — Node.js, `cheerio` para parseo de HTML, API de Anthropic para traducción. Solo corre
  en la máquina del desarrollador, nunca se sirve a usuarios.
- `worker/` — Cloudflare Worker, único propósito: agregar cabecera CORS a 2 endpoints de RuneMetrics
  (Jagex no las envía, ni siquiera dentro del navegador embebido de Alt1).
- `data/` — JSON generado por el scraper, commiteado al repo, servido como archivos estáticos junto
  con `app/`.

## Estructura
```
app/
  appconfig.json  index.html  icon.png
  css/styles.css
  js/{main,state,sidebar,detail,dataset,runemetrics,matching,settings,skills,icons,titleNormalize}.js
  data/aliases.json
scraper/
  package.json  .env.example
  src/{wikiApi,wikitext,slug,fetchQuestList,fetchQuestPage,fetchSeasonalList,fetchSeasonalTitles,
       parseMetadata,parseSteps,parseTables,parseRewards,resolveImages,translate,glossary.json,
       buildDataset,run,migrate,checkNewQuests,generateIcon,generateSkillIcons,skillIcons}.js
  cache/ (gitignored)
data/
  index.json
  quests/*.json (367 archivos)
worker/
  runemetrics-proxy.js  wrangler.toml  package.json
.github/workflows/{pages.yml,check-new-quests.yml}
```

## Archivos clave
- `scraper/src/run.js` — scraping completo + traducción, con toda la lógica de casos especiales
  (sagas excluidas, misiones hub, `Unstable Foundations`, ajuste de puntos de misión) documentada
  ahí mismo en comentarios.
- `scraper/src/migrate.js` — re-scrapea la estructura de datos sin gastar créditos de traducción,
  reutilizando el texto en español ya guardado en disco (emparejado por índice de paso).
- `app/js/matching.js` / `app/js/titleNormalize.js` — cruce de títulos entre RuneMetrics y el dataset
  propio (normalización + `data/aliases.json` para los casos que no matchean por texto).
- `app/js/skills.js` — consulta de niveles reales del jugador (vía el Worker) para los requisitos de
  habilidad en el detalle de cada misión.
- `worker/runemetrics-proxy.js` — el único componente que corre como "servidor"; solo reenvía a 2
  endpoints conocidos de RuneMetrics, no es un proxy abierto genérico.

## Instalar y correr
- **Usuario final**: agregar en Alt1 la URL `https://andrediaz11.github.io/rs3-quest-guide-alt1/app/appconfig.json`. No requiere nada más.
- **Desarrollo local del plugin**: `node scripts/dev-server.js` (sirve la raíz del repo en `localhost:4173`, abrir `/app/index.html`).
- **Scraper**: `cd scraper && npm install`, ver comandos en `README.md`.
- **Worker**: `cd worker && npx wrangler deploy`.

## Env vars
- `scraper/.env` → `ANTHROPIC_API_KEY` (solo para traducir; nunca se commitea, nunca se referencia desde `app/`).
- Sin env vars en `app/` ni en `worker/` (el Worker no necesita credenciales, solo reenvía a un endpoint público).

## Estado
Funcional: sí | Beta: no (mantenimiento continuo) | Última revisión: corrección de parsing de opciones
de chat (enlaces anidados, "~", marcadores "1."/"3/4"), tablas de puzzle con celdas bloqueadas por
`{{NA|colspan}}`, reclasificación de sagas como miniquest, recomputo fresco de `isSeasonal` en cada
migrate, limpieza de notación de piso ambigua (UK/US) y del artefacto "(via)" en texto de inicio y
recompensas, chequeo diario automático de misiones nuevas, y limpieza de claves i18n muertas.

## Integraciones externas
- **RuneMetrics (Jagex)** — estado de misiones y niveles del jugador. Público, sin credenciales.
  Requiere el proxy CORS del Worker para poder consultarse desde el navegador (incluido el embebido
  de Alt1). Modo prueba y producción son el mismo endpoint (no hay sandbox de Jagex).
- **runescape.wiki (MediaWiki API)** — fuente de todo el contenido de las guías e imágenes. Público,
  sin credenciales. Solo se consulta desde `scraper/`, nunca desde `app/` en producción.
- **Anthropic API** — traducción de las guías al español. Solo se usa en `scraper/`, con
  `ANTHROPIC_API_KEY` propia del desarrollador.

## Escalabilidad
- Agregar un nuevo idioma de guía: los campos de texto ya son objetos `{en, es}` — añadir una clave
  más (ej. `fr`) en el dataset y en `localizedText()` de `app/js/detail.js`.
- Agregar un nuevo filtro de sidebar: seguir el patrón de chips en `app/js/sidebar.js` (`buildFilterBar`)
  y el campo correspondiente en `state.activeFilters`.
- Cambios estructurales en el dataset (nuevos campos por paso, etc.): usar `scraper/src/migrate.js`
  como base para no re-traducir todo de nuevo.

## Compatibilidad
Sin dependencias de sistema operativo. El dev server (`scripts/dev-server.js`) es Node puro sin
paquetes externos.

## Datos de prueba
No aplica (no hay login propio; el plugin consulta el nombre de cuenta real de RuneScape que el
usuario configura en Ajustes).

## Versión
1.1.0 — versión base concluida más una ronda extensa de correcciones de datos/parsing y
mantenimiento continuo (367 misiones, 473 QP verificado).

## Cambios
1. Chequeo diario automatizado de misiones nuevas (`check-new-quests.yml`, antes semanal) que abre
   un PR con el scraping en inglés (gratis, sin traducir).
2. Limpieza de notación de piso ambigua UK/US (`1st floor[UK]2nd floor[US]`) tanto en metadatos
   (punto de inicio, items, kills) como en recompensas — bug de extracción HTML, no de wikitext.
3. Eliminación del artefacto "(via )" colgante en el punto de inicio (enlace de mapa interactivo
   despojado de su texto) en 36 misiones en inglés y 22 traducciones en español ya existentes.
4. Corrección de tablas de solución de puzzles: celdas `{{NA|colspan=N|}}` ahora se expanden
   correctamente en vez de colapsar y desplazar las columnas siguientes; celdas bloqueadas
   resaltadas visualmente y tamaño de grilla fijo independiente del tamaño de ventana.
5. Corrección de parsing de opciones de chat: enlaces wiki anidados dentro de una opción, el
   símbolo "~" como sinónimo de "any", y marcadores "1." (con punto) y "3/4" (posición combinada).
6. Fremennik Sagas reclasificadas como miniquest (coincide con el filtro nativo de RS3);
   `isMiniquest` e `isSeasonal` ahora se recalculan frescos en cada migrate en vez de copiarse
   del disco (bug de datos obsoletos encontrado dos veces con la misma causa raíz).
7. Limpieza de 5 claves i18n muertas en `app/js/i18n.js` (`metaYes`, `metaNo`, `welcomeTitle`,
   `welcomeIntro`, `welcomeSyncHint`), reemplazadas hace tiempo por HTML hardcodeado.
8. Rediseño del sidebar: popover de Filter + dropdown de Sort (4 modos) reemplazando los chips.
9. Rediseño del panel de detalle al estilo Quick guide de la wiki (requisitos con ✓/✗ reales, items
   en lista, pasos por sección, recompensas al final con banner).
10. Niveles de habilidad reales del jugador vía RuneMetrics (Worker + `skills.js`) para los requisitos.
11. Integración de RuneMetrics para auto-marcado de misiones completadas.
12. Scraper completo del dataset (367 misiones) con traducción al español.
