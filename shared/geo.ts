// Polyline + route-matching helpers shared by the frontend and the Pages Function.
import { VENUE } from "./zones";

export interface LatLng {
  lat: number;
  lng: number;
}

/** A person is "on the same route" if their start is within this distance of the other's route. */
export const MATCH_RADIUS_KM = 2;

/** Decode a Google encoded polyline (precision 5). */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of ["lat", "lng"] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        if (index >= encoded.length) return points;
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "lat") lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function encodePolyline(points: LatLng[]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

/** Fallback route when no directions are available: a straight line start -> venue. */
export function straightLineRoute(start: LatLng): string {
  return encodePolyline([start, { lat: VENUE.lat, lng: VENUE.lng }]);
}

/** True for a route that is only the start and the venue, i.e. the straight-line fallback rather than a road route. */
export function isStraightLine(encoded: string | null): boolean {
  return !encoded || decodePolyline(encoded).length <= 2;
}

/**
 * Nearest point on a path to `point`, using a local flat-earth projection per segment.
 * Returns the distance to the path and how far along the path (from its start) that nearest point is.
 */
export function nearestOnPath(point: LatLng, path: LatLng[]): { distKm: number; alongKm: number } {
  if (path.length === 0) return { distKm: Infinity, alongKm: 0 };
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((point.lat * Math.PI) / 180);
  const toXY = (p: LatLng) => ({ x: (p.lng - point.lng) * kmPerDegLng, y: (p.lat - point.lat) * kmPerDegLat });

  let prev = toXY(path[0]);
  let bestDist = Math.hypot(prev.x, prev.y);
  let bestAlong = 0;
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const cur = toXY(path[i]);
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const lenSq = dx * dx + dy * dy;
    const len = Math.sqrt(lenSq);
    // projection of the origin (the point) onto the segment, clamped to [0, 1]
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(prev.x * dx + prev.y * dy) / lenSq));
    const d = Math.hypot(prev.x + t * dx, prev.y + t * dy);
    if (d < bestDist) {
      bestDist = d;
      bestAlong = travelled + t * len;
    }
    travelled += len;
    prev = cur;
  }
  return { distKm: bestDist, alongKm: bestAlong };
}

/** Shortest distance (km) from a point to a path. */
export function distanceToPathKm(point: LatLng, path: LatLng[]): number {
  return nearestOnPath(point, path).distKm;
}

/**
 * Douglas-Peucker simplification: drops points that lie within `toleranceKm` of the straight line
 * between the kept neighbours. Keeps the route shape while cutting storage and matching cost.
 */
export function simplifyPath(points: LatLng[], toleranceKm: number): LatLng[] {
  if (points.length < 3) return points;
  const kmLat = 111.32;
  const kmLng = 111.32 * Math.cos((points[0].lat * Math.PI) / 180);
  const xy = points.map((p) => ({ x: p.lng * kmLng, y: p.lat * kmLat }));
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const dx = xy[b].x - xy[a].x;
    const dy = xy[b].y - xy[a].y;
    const lenSq = dx * dx + dy * dy;
    let worst = 0;
    let worstIdx = -1;
    for (let i = a + 1; i < b; i++) {
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((xy[i].x - xy[a].x) * dx + (xy[i].y - xy[a].y) * dy) / lenSq));
      const d = Math.hypot(xy[i].x - (xy[a].x + t * dx), xy[i].y - (xy[a].y + t * dy));
      if (d > worst) {
        worst = d;
        worstIdx = i;
      }
    }
    if (worstIdx > 0 && worst > toleranceKm) {
      keep[worstIdx] = 1;
      stack.push([a, worstIdx], [worstIdx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Tolerance used for every stored route. Matching radius is 2 km, so 60 m of drift is invisible. */
export const ROUTE_TOLERANCE_KM = 0.06;

export interface RouteLike {
  lat: number;
  lng: number;
  route_polyline: string | null;
}

/** Distance (km) between two people's routes, as the smaller of "my start to your route" and vice versa. */
export function routeGapKm(a: RouteLike, b: RouteLike): number {
  const aPath = a.route_polyline ? decodePolyline(a.route_polyline) : [];
  const bPath = b.route_polyline ? decodePolyline(b.route_polyline) : [];
  return Math.min(distanceToPathKm(a, bPath), distanceToPathKm(b, aPath));
}
