import { VENUE, haversineKm } from "../shared/zones";
import { decodePolyline, type LatLng } from "../shared/geo";
import { COLORS, MAX_DRAWN_ROUTES, markerKey, routesSignature, type MapView } from "./map-view";
import { VEHICLE_LABEL, type Attendee } from "../shared/types";

// Map3DElement / Marker3DElement / Polyline3DElement come from the "maps3d" library and
// aren't fully covered by @types/google.maps yet — typed loosely on purpose.
type Map3DElement = HTMLElement & {
  center: { lat: number; lng: number; altitude: number };
  range: number;
  tilt: number;
  heading: number;
};

/** The default map: Google's 3D map. Markers and routes are updated incrementally between refreshes. */
export async function createMap3D(): Promise<MapView> {
  const lib = (await google.maps.importLibrary("maps3d")) as any;
  const Marker3D = lib.Marker3DElement;
  const Polyline3D = lib.Polyline3DElement;
  const mapEl = document.getElementById("map3d") as Map3DElement;

  mapEl.append(
    new Marker3D({
      position: { lat: VENUE.lat, lng: VENUE.lng, altitude: 50 },
      label: VENUE.name,
      extruded: true,
    })
  );

  const markers = new Map<number, { key: string; el: any }>();
  let routeLines: any[] = [];
  let signature = "";
  let previewLine: any = null;

  function makeLine(path: LatLng[], color: string, width: number) {
    const line = new Polyline3D({
      path: path.map((p) => ({ lat: p.lat, lng: p.lng, altitude: 5 })),
      altitudeMode: "RELATIVE_TO_GROUND",
      strokeColor: color,
      strokeWidth: width,
      // dark casing keeps the lime/cyan lines readable on the light regular map as well as satellite
      outerColor: "#08090E",
      outerWidth: 0.35,
      drawsOccludedSegments: true,
    });
    mapEl.append(line);
    return line;
  }

  function focusPath(path: LatLng[]): void {
    if (path.length === 0) return;
    const lats = path.map((p) => p.lat);
    const lngs = path.map((p) => p.lng);
    const spanKm = Math.max(
      haversineKm(
        { lat: Math.min(...lats), lng: Math.min(...lngs) },
        { lat: Math.max(...lats), lng: Math.max(...lngs) }
      ),
      2
    );
    mapEl.center = {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      altitude: 0,
    };
    mapEl.range = spanKm * 1000 * 2.7;
    mapEl.tilt = 35;
    mapEl.heading = 0;
  }

  return {
    renderAttendees(attendees: Attendee[]) {
      const seen = new Set<number>(); // the 3D map doesn't style people by relation, so `who` is unused
      for (const a of attendees) {
        seen.add(a.id);
        const key = markerKey(a);
        const existing = markers.get(a.id);
        if (existing?.key === key) continue;
        existing?.el.remove();

        const el = new Marker3D({
          position: { lat: a.lat, lng: a.lng, altitude: 30 },
          label: a.vehicle ? `${a.name} (${VEHICLE_LABEL[a.vehicle]})` : a.name,
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
    },

    renderRoutes(mine: Attendee | null, matches: Attendee[]) {
      const drawn = matches.slice(0, MAX_DRAWN_ROUTES);
      const next = routesSignature(mine, drawn);
      if (next === signature) return;
      signature = next;

      for (const l of routeLines) l.remove();
      routeLines = [];
      if (!mine) return;

      for (const m of drawn) {
        if (m.route_polyline) routeLines.push(makeLine(decodePolyline(m.route_polyline), COLORS.match, 6));
      }
      if (mine.route_polyline) routeLines.push(makeLine(decodePolyline(mine.route_polyline), COLORS.mine, 10));
    },

    showPreview(polyline: string | null) {
      previewLine?.remove();
      previewLine = null;
      if (!polyline) return;
      const path = decodePolyline(polyline);
      previewLine = makeLine(path, COLORS.preview, 9);
      focusPath(path);
    },

    focusPath,
  };
}
