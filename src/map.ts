import maplibregl, { type GeoJSONSource, type LayerSpecification, type LineLayerSpecification, type StyleSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString } from "geojson";
import METRO from "../shared/metro.json";
import "maplibre-gl/dist/maplibre-gl.css";
import { VENUE } from "../shared/zones";
import { decodePolyline, type LatLng } from "../shared/geo";
import { COLORS, MAX_DRAWN_ROUTES, markerKey, routesSignature, type MapView, type OsmViewName, type Relations } from "./map-view";
import type { Attendee, Vehicle } from "../shared/types";
import { vehicleIcon } from "./icons";
import libertyStyle from "./map-style.json";
import REGION from "../shared/map-region.json";

/**
 * The map: MapLibre GL drawing OpenStreetMap data (OpenFreeMap's tiles and Liberty style).
 * Everything it loads (tiles, label fonts, icons) is served from our own site, from public/map/<version>/,
 * downloaded by `npm run map:assets`. That keeps every map request on the page's own connection and on the
 * nearest Cloudflare edge, instead of a chain of round trips to a server in Europe.
 *
 * One map serves all three views:
 *   "map"  = the Liberty style, as it comes
 *   "dark" = the same style recoloured to the ride2fde UI Redesign palette
 *   "3d"   = the standard style tilted, with buildings raised to their real heights
 */
const ASSETS = `${location.origin}/map/${REGION.version}`;
/** Italic (lakes, villages) is drawn in the regular font: one less ~75 KB font file on first load. */
const FONT_NAMES: Record<string, string> = { "Noto Sans Regular": "noto-regular", "Noto Sans Bold": "noto-bold", "Noto Sans Italic": "noto-regular" };
/** English names only: the label fonts we ship cover Latin script, and the design reads in English. */
const LATIN_NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

/** The Liberty style pointed at our own copies of the tiles, fonts and sprites, limited to the region we ship. */
function localStyle(): StyleSpecification {
  const base = libertyStyle as unknown as StyleSpecification;
  const layers = base.layers
    .filter((l) => l.type !== "raster") // the natural-earth relief is only for zoom levels we never show
    .map((l) => {
      if (l.type !== "symbol" || !l.layout) return l;
      const layout = { ...l.layout } as Record<string, unknown>;
      const fonts = layout["text-font"] as string[] | undefined;
      if (fonts) layout["text-font"] = fonts.map((f) => FONT_NAMES[f] ?? "noto-regular");
      if (JSON.stringify(layout["text-field"] ?? "").includes("name:nonlatin")) layout["text-field"] = LATIN_NAME;
      return { ...l, layout } as LayerSpecification;
    });
  return {
    ...base,
    sources: {
      openmaptiles: {
        type: "vector",
        tiles: [`${ASSETS}/tiles/{z}/{x}/{y}.pbf`],
        minzoom: REGION.minzoom,
        maxzoom: REGION.maxzoom,
        bounds: REGION.bounds as [number, number, number, number],
        attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
      },
    },
    glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ASSETS}/sprites/ofm`,
    layers,
  };
}

/** The dark palette from the "ride2fde UI Redesign" canvas. */
const DARK = {
  land: "#0a0c12",
  water: "#0c1a22",
  park: "#0d1710",
  road: "#1d212d",
  boundary: "#2c3242",
  label: "#5d6578",
};

/** Names of people who are neither you nor on your way appear only when zoomed in this far. */
const LABEL_ZOOM = 13;
const VENUE_CENTER: [number, number] = [VENUE.lng, VENUE.lat];
const PITCH_3D = 60;
const BEARING_3D = -20;

type PinKind = "me" | "match" | "other" | "venue";

/** The text on a pin's tag: first names in capitals, like the design. */
function tagText(kind: PinKind, a?: Attendee): string {
  if (kind === "me") return "YOU";
  if (kind === "venue") return "IIT HYDERABAD · KANDI";
  const first = (a?.name ?? "").split(" ")[0].toUpperCase();
  // the hover tag on everyone else's square also says which side of the pool they are on
  return kind === "other" && a ? `${first} · ${a.role === "giver" ? "RIDE GIVER" : "RIDE TAKER"}` : first;
}

function pinElement(kind: PinKind, tag: string, vehicle: Vehicle | null = null): HTMLElement {
  const el = document.createElement("div");
  el.className = `pin ${kind}`;
  const dot = document.createElement("span");
  dot.className = "pin-dot";
  const label = document.createElement("span");
  label.className = "pin-label";
  if (vehicle) label.insertAdjacentHTML("beforeend", vehicleIcon(vehicle, 18)); // a fixed icon, never user text
  label.append(tag); // appended as text, so a name can never inject markup
  el.append(dot, label);
  return el;
}

/** Recolour the Liberty style to the dark palette: roads and places stay, everything else goes quiet. */
function darken(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.flatMap((layer): LayerSpecification[] => {
    const id = layer.id;
    if (layer.type === "raster" || layer.type === "fill-extrusion") return [];
    if (layer.type === "background") return [{ ...layer, paint: { "background-color": DARK.land } } as LayerSpecification];
    if (layer.type === "fill") {
      const color = id === "water" ? DARK.water : id.startsWith("park") || id.includes("wood") || id.includes("grass") ? DARK.park : DARK.land;
      return [{ ...layer, paint: { "fill-color": color, "fill-opacity": 1 } } as LayerSpecification];
    }
    if (layer.type === "line") {
      if (id.includes("rail") || id.includes("path") || id.includes("casing") || id.startsWith("aeroway") || id === "park_outline") return [];
      const color = id.startsWith("waterway") ? DARK.water : id.startsWith("boundary") ? DARK.boundary : DARK.road;
      return [{ ...layer, paint: { ...layer.paint, "line-color": color, "line-opacity": 1 } } as LayerSpecification];
    }
    if (layer.type === "symbol") {
      if (!id.startsWith("label_")) return []; // no POIs, road names, shields or transit: the routes stay the focus
      return [{ ...layer, paint: { "text-color": DARK.label, "text-halo-color": DARK.land, "text-halo-width": 1.5 } } as LayerSpecification];
    }
    return [layer];
  });
  return { ...style, layers };
}

/** The standard look, minus raised buildings unless we're in 3D. */
function standard(style: StyleSpecification, threeD: boolean): StyleSpecification {
  return threeD ? style : { ...style, layers: style.layers.filter((l) => l.type !== "fill-extrusion") };
}

const METRO_KEY = "ride2fde:showMetro";

/** The metro lines are shown unless the viewer turned them off. */
function readShowMetro(): boolean {
  try {
    return localStorage.getItem(METRO_KEY) !== "0";
  } catch {
    return true;
  }
}

export interface MapController extends MapView {
  setView(name: OsmViewName): Promise<void>;
}

export async function createMap(container: HTMLElement): Promise<MapController> {
  // Built once; each look is a recoloured or trimmed copy of it.
  const baseStyle = localStyle();
  const styleFor = (name: OsmViewName) => (name === "dark" ? darken(baseStyle) : standard(baseStyle, name === "3d"));

  const map = new maplibregl.Map({
    container,
    style: styleFor("map"),
    center: VENUE_CENTER,
    zoom: 11,
    minZoom: REGION.minzoom,
    maxZoom: 18,
    // We ship map data for Greater Hyderabad only, so the view stays inside it.
    maxBounds: REGION.bounds as [number, number, number, number],
    // new tiles and labels fade in quickly rather than over the default 300 ms
    fadeDuration: 150,
    // Phones: one finger scrolls the page and two fingers move the map, so the map never traps scrolling.
    cooperativeGestures: window.matchMedia("(pointer: coarse)").matches,
    attributionControl: false, // added top-right below, clear of our legend and zoom buttons
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
  // Start collapsed to the ⓘ button (MapLibre opens it at first); a tap shows the full credit.
  const collapseCredit = () => container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
  map.touchPitch.disable();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The map style didn't load")), 20_000);
    map.once("load", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  collapseCredit();
  new maplibregl.Marker({ element: pinElement("venue", tagText("venue")) }).setLngLat(VENUE_CENTER).addTo(map);

  // ── Legend (bottom left) and zoom buttons (bottom right), as in the design ──
  const HINT = window.matchMedia("(pointer: coarse)").matches ? "Tap a pin to see who it is and their route" : "Hover over a pin to see who it is and their route";
  const legend = document.createElement("div");
  legend.className = "map-legend";
  legend.innerHTML = `
    <span><i class="swatch lime"></i>Your route</span>
    <span><i class="swatch cyan"></i>On your way</span>
    <span><i class="swatch grey"></i>Elsewhere</span>
    <span class="legend-hint" title="${HINT}"><i class="hint-i">i</i>${HINT}</span>
    <span class="legend-vehicles">${vehicleIcon("car", 16)}Car ${vehicleIcon("bike", 16)}Bike</span>
    <button type="button" class="legend-toggle" aria-pressed="true" title="Show or hide the Hyderabad Metro lines"><i class="swatch metro"></i>Metro</button>`;

  const zoom = document.createElement("div");
  zoom.className = "map-zoom";
  for (const [label, text, delta] of [["Zoom in", "+", 1], ["Zoom out", "−", -1]] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => map.zoomTo(map.getZoom() + delta));
    zoom.append(b);
  }
  container.append(legend, zoom);

  const updateLabels = () => container.classList.toggle("show-labels", map.getZoom() >= LABEL_ZOOM);
  map.on("zoom", updateLabels);
  updateLabels();

  // ── Route lines: one GeoJSON source, styled by each feature's properties ──
  type RouteFeature = Feature<LineString, { color: string; width: number; opacity: number; glow: boolean; order: number }>;
  let routeFeatures: RouteFeature[] = [];
  let previewFeatures: RouteFeature[] = [];
  let hoverFeatures: RouteFeature[] = [];
  let signature = "";
  let view: OsmViewName = "map";

  const feature = (path: LatLng[], color: string, width: number, order: number, opts: { glow?: boolean; opacity?: number } = {}): RouteFeature => ({
    type: "Feature",
    properties: { color, width, opacity: opts.opacity ?? 1, glow: opts.glow ?? false, order },
    geometry: { type: "LineString", coordinates: path.map((p) => [p.lng, p.lat]) },
  });

  function pushRoutes() {
    const source = map.getSource("routes") as GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [...routeFeatures, ...hoverFeatures, ...previewFeatures] });
  }

  // ── Hyderabad Metro: the three lines and their stations, under the people's routes ──
  // Data from OpenStreetMap (shared/metro.json, made by `npm run metro:data`).
  const METRO_LAYERS = ["metro-casing", "metro-line", "metro-stations", "metro-labels", "metro-miyapur"];
  let showMetro = readShowMetro();

  function addMetroLayers() {
    if (map.getSource("metro")) return;
    const dark = view === "dark";
    const visibility = showMetro ? "visible" : "none";
    const isLine = ["==", ["get", "kind"], "line"] as const;
    const isStation = ["==", ["get", "kind"], "station"] as const;
    const labelPaint = { "text-color": dark ? "#e6e9ef" : "#1b1f2a", "text-halo-color": dark ? "#08090e" : "#ffffff", "text-halo-width": 1.5 };
    map.addSource("metro", { type: "geojson", data: METRO as unknown as FeatureCollection });
    map.addLayer({
      id: "metro-casing",
      type: "line",
      source: "metro",
      filter: isLine as never,
      layout: { visibility, "line-cap": "round", "line-join": "round" },
      paint: { "line-color": dark ? "#08090e" : "#ffffff", "line-opacity": 0.8, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 15, 9] },
    });
    map.addLayer({
      id: "metro-line",
      type: "line",
      source: "metro",
      filter: isLine as never,
      layout: { visibility, "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 15, 5] },
    });
    map.addLayer({
      id: "metro-stations",
      type: "circle",
      source: "metro",
      filter: isStation as never,
      minzoom: 11,
      layout: { visibility },
      paint: {
        "circle-color": "#ffffff",
        "circle-stroke-color": "#08090e",
        "circle-stroke-width": ["case", ["get", "interchange"], 2.5, 1.5],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, ["case", ["get", "interchange"], 4, 2.5], 15, ["case", ["get", "interchange"], 7, 5]],
      },
    });
    map.addLayer({
      id: "metro-labels",
      type: "symbol",
      source: "metro",
      filter: isStation as never,
      minzoom: 13,
      layout: { visibility, "text-field": ["get", "name"], "text-font": ["noto-bold"], "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.7], "text-optional": true },
      paint: labelPaint,
    });
    // Miyapur, the end of the Red Line, is the closest station to IIT Hyderabad: named at every zoom.
    map.addLayer({
      id: "metro-miyapur",
      type: "symbol",
      source: "metro",
      filter: ["all", isStation, ["==", ["get", "name"], "Miyapur"]] as never,
      maxzoom: 13,
      layout: { visibility, "text-field": "Miyapur Metro", "text-font": ["noto-bold"], "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.7] },
      paint: labelPaint,
    });
  }

  const metroToggle = legend.querySelector<HTMLButtonElement>(".legend-toggle")!;
  metroToggle.setAttribute("aria-pressed", String(showMetro));
  metroToggle.addEventListener("click", () => {
    showMetro = !showMetro;
    metroToggle.setAttribute("aria-pressed", String(showMetro));
    for (const id of METRO_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showMetro ? "visible" : "none");
    try {
      localStorage.setItem(METRO_KEY, showMetro ? "1" : "0");
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  });

  /** Adds the route layers to whatever style is loaded. A style change wipes them, so this runs after each one. */
  function addRouteLayers() {
    addMetroLayers(); // first, so the metro sits under the people's routes
    if (map.getSource("routes")) return;
    const dark = view === "dark";
    map.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const base: Pick<LineLayerSpecification, "source" | "layout"> = {
      source: "routes",
      layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "order"] },
    };
    if (dark) {
      // a soft glow behind your own route and the preview
      map.addLayer({ ...base, id: "routes-glow-wide", type: "line", filter: ["get", "glow"], paint: { "line-color": ["get", "color"], "line-opacity": 0.16, "line-width": ["+", ["get", "width"], 14] } });
      map.addLayer({ ...base, id: "routes-glow", type: "line", filter: ["get", "glow"], paint: { "line-color": ["get", "color"], "line-opacity": 0.3, "line-width": ["+", ["get", "width"], 7] } });
    } else {
      // on the light map a glow would vanish, so a dark outline keeps lime and cyan readable
      map.addLayer({ ...base, id: "routes-casing", type: "line", paint: { "line-color": "#08090e", "line-opacity": 0.9, "line-width": ["+", ["get", "width"], 4] } });
    }
    map.addLayer({ ...base, id: "routes-line", type: "line", paint: { "line-color": ["get", "color"], "line-opacity": ["get", "opacity"], "line-width": ["get", "width"] } });
    pushRoutes();
  }
  addRouteLayers();
  map.on("style.load", addRouteLayers);

  function focusPath(path: LatLng[]): void {
    if (path.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const p of path) bounds.extend([p.lng, p.lat]);
    // the right side leaves room for the "YOU" tag; pitch and bearing are the look's own, so a camera move
    // that starts mid-way through switching to 3D still ends tilted
    map.fitBounds(bounds, {
      padding: { top: 64, bottom: 56, left: 56, right: 110 },
      maxZoom: 15,
      pitch: view === "3d" ? PITCH_3D : 0,
      bearing: view === "3d" ? BEARING_3D : 0,
      duration: 600,
    });
  }

  const pins = new Map<number, { key: string; marker: maplibregl.Marker }>();
  function showHover(polyline: string | null): void {
    hoverFeatures = polyline ? [feature(decodePolyline(polyline), COLORS.hover, 5, 3, { glow: true })] : [];
    pushRoutes();
  }
  const byId = new Map<number, Attendee>(); // latest data, so a hover always draws the current route

  return {
    renderAttendees(attendees: Attendee[], who: Relations) {
      const seen = new Set<number>();
      byId.clear();
      for (const a of attendees) {
        byId.set(a.id, a);
        seen.add(a.id);
        const kind: PinKind = a.id === who.meId ? "me" : who.matchIds.has(a.id) ? "match" : "other";
        const key = `${markerKey(a)}|${kind}`;
        const existing = pins.get(a.id);
        if (existing?.key === key) continue;
        existing?.marker.remove();

        const el = pinElement(kind, tagText(kind, a), a.role === "giver" ? a.vehicle : null);
        if (kind === "other") {
          // hovering (or tapping) a grey square draws that person's route
          const dot = el.querySelector(".pin-dot")!;
          dot.addEventListener("mouseenter", () => showHover(byId.get(a.id)?.route_polyline ?? null));
          dot.addEventListener("mouseleave", () => showHover(null));
        }
        const marker = new maplibregl.Marker({ element: el }).setLngLat([a.lng, a.lat]).addTo(map);
        pins.set(a.id, { key, marker });
      }
      for (const [id, entry] of pins) {
        if (seen.has(id)) continue;
        entry.marker.remove();
        pins.delete(id);
      }
    },

    renderRoutes(mine: Attendee | null, matches: Attendee[]) {
      const drawn = matches.slice(0, MAX_DRAWN_ROUTES);
      const next = routesSignature(mine, drawn);
      if (next === signature) return;
      signature = next;

      routeFeatures = [];
      // Someone who hasn't added a route yet still sees everyone's routes (drawn here as "matches").
      for (const m of drawn) {
        if (m.route_polyline) routeFeatures.push(feature(decodePolyline(m.route_polyline), COLORS.match, 4, 1, { opacity: 0.85 }));
      }
      if (mine) {
        if (mine.route_polyline) routeFeatures.push(feature(decodePolyline(mine.route_polyline), COLORS.mine, 5, 2, { glow: true }));
      }
      pushRoutes();
    },

    showHoverRoute: showHover,

    showPreview(polyline: string | null) {
      previewFeatures = [];
      if (polyline) {
        const path = decodePolyline(polyline);
        previewFeatures = [feature(path, COLORS.preview, 4, 3, { glow: true })];
        focusPath(path);
      }
      pushRoutes();
    },

    focusPath,

    async setView(next: OsmViewName) {
      if (next === view) return;
      view = next;
      const threeD = next === "3d";
      container.classList.toggle("dark", next === "dark");

      // A fresh style for each look; the route layers are added back (with the right look) on "style.load".
      map.setStyle(styleFor(next), { diff: false });
      map.easeTo({ pitch: threeD ? PITCH_3D : 0, bearing: threeD ? BEARING_3D : 0, duration: 800 });
      if (threeD) map.touchPitch.enable();
      else map.touchPitch.disable();
    },
  };
}
