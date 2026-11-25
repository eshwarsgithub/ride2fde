import { VENUE, haversineKm } from "../shared/zones";
import { decodePolyline, type LatLng } from "../shared/geo";
import type { Attendee } from "../shared/types";

// Map3DElement / Marker3DElement / Polyline3DElement are part of the alpha "maps3d"
// library and aren't fully covered by @types/google.maps yet — typed loosely on purpose.
type Map3DElement = HTMLElement & {
  center: { lat: number; lng: number; altitude: number };
  range: number;
  tilt: number;
  heading: number;
};

let marker3dCtor: any;
let polyline3dCtor: any;
let previewLine: any = null;

// Markers are kept between refreshes and only added/removed when a person actually changed.
const markers = new Map<number, { key: string; el: any }>();
let routeLines: any[] = [];
let routeSignature = "";

/** Route colours: yours is the deep highway green, matches amber, and the form preview blue. */
const COLORS = { mine: "#0B5D3B", match: "#FF8A00", preview: "#1F6FEB" };

/** Draw at most this many match routes; more would just be a tangle of lines. */
export const MAX_DRAWN_ROUTES = 8;

export async function initMap(): Promise<Map3DElement> {
  const lib = (await google.maps.importLibrary("maps3d")) as any;
  marker3dCtor = lib.Marker3DElement;
  polyline3dCtor = lib.Polyline3DElement;

  const mapEl = document.getElementById("map3d") as Map3DElement;

  const venueMarker = new marker3dCtor({
    position: { lat: VENUE.lat, lng: VENUE.lng, altitude: 50 },
    label: VENUE.name,
    extruded: true,
  });
  mapEl.append(venueMarker);

  return mapEl;
}

export function renderAttendeeMarkers(mapEl: Map3DElement, attendees: Attendee[]): void {
  const seen = new Set<number>();

  for (const a of attendees) {
    seen.add(a.id);
    const key = `${a.role}|${a.name}|${a.lat}|${a.lng}`;
    const existing = markers.get(a.id);
    if (existing?.key === key) continue;
    existing?.el.remove();

    const el = new marker3dCtor({
      position: { lat: a.lat, lng: a.lng, altitude: 30 },
      label: `${a.role === "giver" ? "🚗" : "🙋"} ${a.name}`,
      extruded: true,
    });
    mapEl.append(el);
    markers.set(a.id, { key, el });
  }

  for (const [id, m] of markers) {
    if (seen.has(id)) continue;
    m.el.remove();
    markers.delete(id);
  }
}

function makeLine(mapEl: Map3DElement, path: LatLng[], color: string, width: number) {
  const line = new polyline3dCtor({
    path: path.map((p) => ({ lat: p.lat, lng: p.lng, altitude: 5 })),
    altitudeMode: "RELATIVE_TO_GROUND",
    strokeColor: color,
    strokeWidth: width,
    drawsOccludedSegments: true,
  });
  mapEl.append(line);
  return line;
}

/** Draw the viewer's own route (green) and the closest matches' routes (amber). Skips work if nothing changed. */
export function renderRoutes(mapEl: Map3DElement, mine: Attendee | null, matches: Attendee[]): void {
  const drawn = matches.slice(0, MAX_DRAWN_ROUTES);
  const signature = mine
    ? `${mine.id}:${mine.route_polyline?.length ?? 0}|${drawn.map((m) => m.id).join(",")}`
    : "";
  if (signature === routeSignature) return;
  routeSignature = signature;

  for (const l of routeLines) l.remove();
  routeLines = [];
  if (!mine) return;

  for (const m of drawn) {
    if (m.route_polyline) routeLines.push(makeLine(mapEl, decodePolyline(m.route_polyline), COLORS.match, 6));
  }
  if (mine.route_polyline) routeLines.push(makeLine(mapEl, decodePolyline(mine.route_polyline), COLORS.mine, 10));
}

/** Show (or clear, with null) the orange route preview while the form is open. */
export function showPreviewRoute(mapEl: Map3DElement, polyline: string | null): void {
  previewLine?.remove();
  previewLine = null;
  if (!polyline) return;
  const path = decodePolyline(polyline);
  previewLine = makeLine(mapEl, path, COLORS.preview, 9);
  focusPath(mapEl, path);
}

/** Re-centre the camera so the whole path is in view. */
export function focusPath(mapEl: Map3DElement, path: LatLng[]): void {
  if (path.length === 0) return;
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    altitude: 0,
  };
  const spanKm = Math.max(
    haversineKm(
      { lat: Math.min(...lats), lng: Math.min(...lngs) },
      { lat: Math.max(...lats), lng: Math.max(...lngs) }
    ),
    2
  );
  mapEl.center = center;
  mapEl.range = spanKm * 1000 * 1.8;
  mapEl.tilt = 35;
  mapEl.heading = 0;
}
