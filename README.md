# Quest Compass — Alt1 Plugin para RS3

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

### Regenerar el dataset con la misma estructura, reusando traducciones existentes

Si se necesita volver a scrapear todas las misiones (por ejemplo tras un cambio en el parser de pasos
o secciones) sin pagar de nuevo por traducir lo que ya está traducido, usar el script de migración:

```
node scraper/src/migrate.js              # todo el dataset
node scraper/src/migrate.js --only=slug  # una sola misión (nombre del archivo en data/quests/, sin .json)
```

Re-scrapea cada misión en inglés (gratis) y reutiliza la traducción en español ya guardada en disco,
emparejando pasos por índice.

### Estado actual del dataset

- 362 misiones y minimisiones scrapeadas de las 368 en `Category:Quick guides` (las 6 restantes son
  páginas "hub" sin guía propia, ej. *Recipe for Disaster*, que enlaza a sub-misiones ya scrapeadas por
  separado, o casos especiales documentados como `guideNote` en su JSON).
- 360/362 con guía completamente traducida al español. Las 2 restantes (*Tales of Pride*,
  *Tomes of the Warlock*) se pueden traducir con
  `node --env-file=.env src/run.js --only="Nombre de la misión" --force`.
- Puntos de misión verificados 1:1 contra una cuenta real (ver comentarios en `scraper/src/run.js`
  sobre sagas, misiones hub y el caso especial de *Unstable Foundations*).
