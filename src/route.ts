import { VENUE, haversineKm } from "../shared/zones";
import { ROUTE_TOLERANCE_KM, encodePolyline, simplifyPath, straightLineRoute } from "../shared/geo";

export interface RouteResult {
  polyline: string;
  distance_km: number;
  eta_min: number | null;
  /** false when Google Directions wasn't available and we fell back to a straight line */
  exact: boolean;
}

/** Driving route from a point to the venue. Falls back to a straight line if Directions fails. */
export async function routeToVenue(point: { lat: number; lng: number }): Promise<RouteResult> {
  try {
    // Routes API (new). The legacy DirectionsService isn't available to new Google Cloud projects.
    const lib = (await google.maps.importLibrary("routes")) as any;
    const { routes } = await lib.Route.computeRoutes({
      origin: point,
      destination: { lat: VENUE.lat, lng: VENUE.lng },
      travelMode: "DRIVING",
      fields: ["path", "distanceMeters", "durationMillis"],
    });
    const route = routes?.[0];
    if (route?.path?.length >= 2) {
      const path = route.path.map((p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng }));
      return {
        polyline: encodePolyline(simplifyPath(path, ROUTE_TOLERANCE_KM)),
        distance_km: Math.round(route.distanceMeters / 100) / 10,
        eta_min: route.durationMillis != null ? Math.round(route.durationMillis / 60000) : null,
        exact: true,
      };
    }
  } catch (err) {
    console.warn("Routes API unavailable, using a straight-line route", err);
  }
  return {
    polyline: straightLineRoute(point),
    distance_km: Math.round(haversineKm(point, VENUE) * 1.3 * 10) / 10, // rough road factor
    eta_min: null,
    exact: false,
  };
}
