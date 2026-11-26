import { VENUE, haversineKm } from "../shared/zones";
import { ROUTE_TOLERANCE_KM, decodePolyline, encodePolyline, simplifyPath, straightLineRoute } from "../shared/geo";

export interface RouteResult {
  polyline: string;
  distance_km: number;
  eta_min: number | null;
  /** false when the routing service wasn't available and we fell back to a straight line */
  exact: boolean;
}

/**
 * OSRM, the open-source router behind the directions on openstreetmap.org. Its public server is free with no key,
 * on a fair-use basis: one request per route, only when someone picks a start point.
 */
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

/** Driving route from a point to the venue. Falls back to a straight line if the router fails. */
export async function routeToVenue(point: { lat: number; lng: number }): Promise<RouteResult> {
  try {
    const url = `${OSRM_URL}/${point.lng},${point.lat};${VENUE.lng},${VENUE.lat}?overview=full&geometries=polyline`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`OSRM answered ${res.status}`);
    const data = (await res.json()) as { code: string; routes?: { geometry: string; distance: number; duration: number }[] };
    const route = data.code === "Ok" ? data.routes?.[0] : undefined;
    // OSRM's "polyline" geometry is the same encoded format (precision 5) the app stores.
    const path = route ? decodePolyline(route.geometry) : [];
    if (route && path.length >= 2) {
      return {
        polyline: encodePolyline(simplifyPath(path, ROUTE_TOLERANCE_KM)),
        distance_km: Math.round(route.distance / 100) / 10,
        eta_min: Math.round(route.duration / 60),
        exact: true,
      };
    }
  } catch (err) {
    console.warn("Routing unavailable, using a straight-line route", err);
  }
  return {
    polyline: straightLineRoute(point),
    distance_km: Math.round(haversineKm(point, VENUE) * 1.3 * 10) / 10, // rough road factor
    eta_min: null,
    exact: false,
  };
}
