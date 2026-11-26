// Runs before `npm run deploy`. Deploys are built on whichever machine runs them, so a missing setting there
// quietly changes what goes live. This prints what the live build will contain, and stops on a real mistake.

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The value for a name: the environment wins, then .env (what Vite does too). */
async function setting(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = (await readFile(join(ROOT, ".env"), "utf8")).split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch {
    return "";
  }
}

const key = await setting("VITE_GOOGLE_MAPS_API_KEY");
const region = JSON.parse(await readFile(join(ROOT, "shared", "map-region.json"), "utf8"));

let tiles = 0;
try {
  tiles = (await readdir(join(ROOT, "public", "map", region.version, "tiles"))).length;
} catch {
  /* the map data hasn't been downloaded yet; `npm run map:assets` runs right after this */
}

console.log("\nDeploy check");
console.log("  Free OpenStreetMap map:", "always included (the default)");
console.log("  Google map option     :", key ? `ON  (key ${key.slice(0, 6)}…${key.slice(-4)}, ${key.length} characters)` : "OFF (no VITE_GOOGLE_MAPS_API_KEY: the Google button will be hidden)");
console.log("  Map data version      :", region.version, tiles ? "(downloaded)" : "(will be downloaded now)");

if (key && !/^AIza[0-9A-Za-z_-]{35}$/.test(key)) {
  console.error("\nVITE_GOOGLE_MAPS_API_KEY doesn't look like a Google Maps key (they start with AIza and are 39 characters).");
  console.error("Fix it in .env, or empty it to deploy without the Google option. Stopping so a bad key doesn't go live.\n");
  process.exit(1);
}
if (!key) {
  console.log("\n  Note: the live site had the Google button before. If that's not intended, stop now and add the key to .env.");
}
console.log("");
