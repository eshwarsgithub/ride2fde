// Builds shared/metro.json: the Hyderabad Metro lines and stations, drawn on our map.
// Source: OpenStreetMap (© OpenStreetMap contributors, ODbL), via the Overpass API. The official L&T map
// (https://ltmetro.com/metro-network-map/) is a schematic picture, not geography, so it can't be laid on a street map.
//
// Run again to refresh the data: `npm run metro:data`. The output is small and committed, so the site never calls Overpass.

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "shared", "metro.json");

/** One OSM route relation per line (one direction is enough: both directions run on the same track). */
const LINES = [
  { id: "red", name: "Red Line", relation: 8297636, color: "#e2231a", ends: "Miyapur – L.B. Nagar" },
  { id: "blue", name: "Blue Line", relation: 5468841, color: "#0a6fc2", ends: "Raidurg – Nagole" },
  { id: "green", name: "Green Line", relation: 10692234, color: "#00a651", ends: "JBS Parade Ground – MG Bus Station" },
];

const round = (n) => Math.round(n * 1e5) / 1e5;

async function overpass(query) {
  // Overpass is a shared free service and asks clients to back off when busy (429/504).
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "User-Agent": "ride2fde metro data sync" },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 15_000 * attempt));
  }
  throw new Error("Overpass didn't answer");
}

/** Cleans OSM station names: "Ameerpet Metro Station" -> "Ameerpet". */
function cleanName(name) {
  return name
    .replace(/\s*\((red|blue|green) line\)\s*$/i, "") // interchanges are mapped once per line: "Parade Grounds (Blue Line)"
    .replace(/\s*\(?\bmetro( station)?\b\)?\s*$/i, "")
    .trim();
}

const ids = LINES.map((l) => l.relation).join(",");
const data = await overpass(`[out:json][timeout:90];rel(id:${ids});out geom;`);

const features = [];
/** name -> { coordinates, lines } so interchange stations appear once */
const stations = new Map();

for (const rel of data.elements) {
  const line = LINES.find((l) => l.relation === rel.id);
  if (!line) continue;
  const track = [];
  for (const m of rel.members) {
    if (m.type === "way" && (m.role === "" || m.role === "route") && m.geometry?.length > 1) {
      track.push(m.geometry.map((p) => [round(p.lon), round(p.lat)]));
    }
    if (m.type === "node" && /^stop/.test(m.role) && m.lat != null) {
      // stop nodes carry no tags in "out geom"; their names are looked up below
      const key = `node/${m.ref}`;
      stations.set(key, { ref: m.ref, coordinates: [round(m.lon), round(m.lat)], lines: new Set([line.id]) });
    }
  }
  if (track.length === 0) throw new Error(`No track found for ${line.name}`);
  features.push({
    type: "Feature",
    properties: { kind: "line", line: line.id, name: line.name, ends: line.ends, color: line.color },
    geometry: { type: "MultiLineString", coordinates: track },
  });
  console.log(`${line.name}: ${track.length} track pieces`);
}

// Names for the stop nodes.
const refs = [...stations.values()].map((s) => s.ref);
const named = await overpass(`[out:json][timeout:60];node(id:${refs.join(",")});out tags;`);
const nameOf = new Map(named.elements.map((n) => [n.id, n.tags?.["name:en"] || n.tags?.name || ""]));

const byName = new Map();
for (const s of stations.values()) {
  const name = cleanName(nameOf.get(s.ref) || "");
  if (!name) continue;
  const existing = byName.get(name.toLowerCase());
  if (existing) {
    for (const l of s.lines) existing.lines.add(l);
  } else {
    byName.set(name.toLowerCase(), { name, coordinates: s.coordinates, lines: new Set(s.lines) });
  }
}

for (const s of byName.values()) {
  features.push({
    type: "Feature",
    properties: { kind: "station", name: s.name, lines: [...s.lines], interchange: s.lines.size > 1 },
    geometry: { type: "Point", coordinates: s.coordinates },
  });
}
console.log(`${byName.size} stations (${[...byName.values()].filter((s) => s.lines.size > 1).map((s) => s.name).join(", ")} are interchanges)`);

const out = {
  type: "FeatureCollection",
  attribution: "© OpenStreetMap contributors (ODbL)",
  generated: new Date().toISOString().slice(0, 10),
  features,
};
await writeFile(OUT, JSON.stringify(out) + "\n");
console.log(`Wrote ${OUT}`);
