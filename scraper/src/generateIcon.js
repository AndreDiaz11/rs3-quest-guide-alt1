import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const OUT_PATH = fileURLToPath(new URL("../../app/icon.png", import.meta.url));

// App icon: a gold compass (matches the header/footer emblem in app/js/icons.js)
// over a dark round tome/book shape, i.e. "the quest guide as a compass".
const SVG = `
<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <circle cx="64" cy="64" r="62" fill="#171310" stroke="#6b5738" stroke-width="3"/>
  <circle cx="64" cy="64" r="46" fill="none" stroke="#e0b84a" stroke-width="4"/>
  <path d="M64 26 L74 58 L106 64 L74 70 L64 102 L54 70 L22 64 L54 58 Z" fill="#f5d576"/>
  <circle cx="64" cy="64" r="7" fill="#e0b84a"/>
</svg>
`.trim();

async function main() {
  const resvg = new Resvg(SVG, { fitTo: { mode: "width", value: 128 } });
  const png = resvg.render().asPng();
  await writeFile(OUT_PATH, png);
  console.log(`[icon] escrito en ${OUT_PATH} (${png.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
