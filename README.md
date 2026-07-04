# RS3 Quest Guide — Alt1 Plugin

Plugin de [Alt1 Toolkit](https://runeapps.org/alt1) para RuneScape 3: guía de misiones en español,
con datos e imágenes sacados de [runescape.wiki](https://runescape.wiki), y marcado automático de
pasos ya completados según el estado real de tu cuenta (vía RuneMetrics).

## Para usuarios

Publicado en GitHub Pages. En Alt1, agrega la app con esta URL de manifest:

```
https://andrediaz11.github.io/rs3-quest-guide-alt1/app/appconfig.json
```

No se necesita instalar nada más ni crear ninguna cuenta ni API key.

## Para el desarrollador

Este repo tiene dos partes separadas:

- **`app/`** — el plugin en sí (HTML/CSS/JS estático, sin build step). Esto es lo único que se
  publica/hostea para que Alt1 lo cargue.
- **`scraper/`** — script Node.js que corre **solo en tu máquina**, nunca se sirve a los usuarios.
  Hace scraping de runescape.wiki, traduce al español con la API de Anthropic, y genera los archivos
  JSON en `data/`. Requiere una `ANTHROPIC_API_KEY` propia (ver `scraper/.env.example`) — esa key
  nunca se commitea ni se referencia desde `app/`.
- **`data/`** — salida generada por el scraper, sí se commitea al repo. `app/` la consume en tiempo de
  ejecución con una ruta relativa (`../data/...`), servida por el mismo GitHub Pages que sirve `app/`.

### Regenerar el dataset

```
cd scraper
npm install
node --env-file=.env src/run.js --only="Hermit Permits" --skip-translate   # una sola misión, sin traducir
node --env-file=.env src/run.js --all                                      # dataset completo, con traducción
```

`--all` es seguro de re-correr las veces que haga falta: **omite automáticamente las misiones que ya
tienen traducción al español**, así que retomar tras cargar más crédito no vuelve a cobrar por las que
ya están hechas. Para forzar la re-traducción de una misión específica (por ejemplo si se mejoró el
prompt de traducción), usa `--force` junto con `--only=`, o `--all --force` para re-traducir todo el
dataset desde cero.

### Estado actual del dataset (última corrida)

- 361/368 misiones y minimisiones scrapeadas (7 son páginas "hub" sin guía propia, ej. *Recipe for
  Disaster*, que enlaza a sub-misiones ya scrapeadas por separado).
- **357/361 traducidas al español (99%).** Las 4 restantes quedaron en inglés por un desajuste de
  líneas en la respuesta del modelo que persistió incluso tras el reintento automático (misiones con
  formato de diálogo inusual): *A Fairy Tale II - Cure a Queen*, *My Arm's Big Adventure*,
  *One Foot in the Grave (miniquest)*, *Tales of Pride*. Se pueden reintentar individualmente con
  `node --env-file=.env src/run.js --only="Nombre de la misión" --force`.
- Las ~207 misiones traducidas en la primera corrida (antes de ajustar el prompt) pueden tener alguna
  inconsistencia menor: algunos diálogos citados entre "(opciones de chat: ...)" quedaron sin traducir.
  Es cosmético, no rompe nada. Para corregirlas hay que forzar su re-traducción con `--force` (tiene
  costo de API).

Ver el plan de implementación completo para el diseño detallado del pipeline y el schema de datos.
