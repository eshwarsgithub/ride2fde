// Downloads everything the map needs into public/map/<version>/ so it can be served from our own Cloudflare site:
// the vector tiles for Greater Hyderabad, the label fonts and the icon sprites, all from OpenFreeMap
// (OpenStreetMap data, © OpenStreetMap contributors, ODbL).
//
// Why: OpenFreeMap's public server answered from Frankfurt, so every map file cost a ~0.5 s round trip from India,
// in a chain (style -> tile index -> tiles -> fonts). Served from our own domain they come from the nearest
// Cloudflare edge, over the connection the page already has.
//
// Run once (and again to refresh the data): `npm run map:assets`. Files already downloaded are skipped.
// The output folder is git-ignored; `npm run deploy` runs this first.

import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAP = JSON.parse(await readFile(join(ROOT, "shared", "map-region.json"), "utf8"));
const OUT = join(ROOT, "public", "map", MAP.version);
const ORIGIN = "https://tiles.openfreemap.org";
const UA = { "User-Agent": "ride2fde map asset sync (one-off download of a small regional extract)" };

/** The fonts the style uses, under the short folder names our style refers to. */
const FONTS = { "noto-regular": "Noto Sans Regular", "noto-bold": "Noto Sans Bold" };
/** Basic Latin through Latin Extended, plus general punctuation: enough for English place names. */
const GLYPH_RANGES = ["0-255", "256-511", "512-767", "768-1023", "8192-8447"];

const exists = (p) => access(p).then(() => true, () => false);

async function download(url, file) {
  if (await exists(file)) return "skip";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 404 || res.status === 204) return "empty"; // no data there (open fields): MapLibre draws nothing
    if (res.ok) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      return "ok";
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`Failed: ${url}`);
}

/** Web-mercator tile numbers covering a box at one zoom. */
function tileRange([west, south, east, north], z) {
  const n = 2 ** z;
  const x = (lng) => Math.floor(((lng + 180) / 360) * n);
  const y = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  return { x0: x(west), x1: x(east), y0: y(north), y1: y(south) };
}

async function pool(items, size, fn) {
  let i = 0;
  const counts = {};
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const item = items[i++];
        const r = await fn(item);
        counts[r] = (counts[r] ?? 0) + 1;
      }
    })
  );
  return counts;
}

const jobs = [];
for (let z = MAP.minzoom; z <= MAP.maxzoom; z++) {
  const { x0, x1, y0, y1 } = tileRange(MAP.bounds, z);
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      jobs.push([`${ORIGIN}/planet/${MAP.version}/${z}/${x}/${y}.pbf`, join(OUT, "tiles", String(z), String(x), `${y}.pbf`)]);
}
for (const [local, remote] of Object.entries(FONTS))
  for (const range of GLYPH_RANGES)
    jobs.push([`${ORIGIN}/fonts/${encodeURIComponent(remote)}/${range}.pbf`, join(OUT, "fonts", local, `${range}.pbf`)]);
for (const suffix of ["", "@2x"])
  for (const ext of ["json", "png"])
    jobs.push([`${ORIGIN}/sprites/${MAP.sprite}/ofm${suffix}.${ext}`, join(OUT, "sprites", `ofm${suffix}.${ext}`)]);

console.log(`Map assets for ${MAP.version}: ${jobs.length} files into ${OUT}`);
const counts = await pool(jobs, 6, ([url, file]) => download(url, file));
console.log("Done:", counts);
