import type { LatLng } from "../shared/geo";
import type { Attendee } from "../shared/types";

/** How each person relates to the viewer, so a map can style "you", "on your way" and "elsewhere" differently. */
export interface Relations {
  meId: number | null;
  matchIds: Set<number>;
}

/** What the app needs from a map, whichever look (standard, dark or 3D) is showing. */
export interface MapView {
  renderAttendees(attendees: Attendee[], who: Relations): void;
  /** Draw the viewer's own route and their closest matches' routes. */
  renderRoutes(mine: Attendee | null, matches: Attendee[]): void;
  /** Show (or clear, with null) the route preview while the form is open. */
  showPreview(polyline: string | null): void;
  /** Show (or clear, with null) the route of the pin the mouse is over. Optional: the Google view doesn't have it. */
  showHoverRoute?(polyline: string | null): void;
  /** Re-centre the camera so the whole path is in view. */
  focusPath(path: LatLng[]): void;
}

/**
 * "map" = the standard OpenStreetMap look (the default), "dark" = the same map restyled dark,
 * "3d" = tilted with raised buildings, "google" = the optional Google Maps view (only with a Google key).
 */
export type MapViewName = "map" | "dark" | "3d" | "google";
/** The looks the free OpenStreetMap map draws itself. */
export type OsmViewName = Exclude<MapViewName, "google">;

/** Route colours follow the FDE Summit palette: yours is lime, matches cyan, the form preview white. */
export const COLORS = { mine: "#D2FF00", match: "#00F0FF", preview: "#FFFFFF", hover: "#FFB020" };

/** Draw at most this many match routes; more would just be a tangle of lines. */
export const MAX_DRAWN_ROUTES = 8;

/** Identifies what a map is currently showing, so a refresh with no change skips redrawing. */
export function routesSignature(mine: Attendee | null, drawn: Attendee[]): string {
  return `${mine ? `${mine.id}:${mine.route_polyline?.length ?? 0}` : "-"}|${drawn.map((m) => `${m.id}:${m.route_polyline?.length ?? 0}`).join(",")}`;
}

/** The key that decides whether a person's marker has to be recreated. */
export function markerKey(a: Attendee): string {
  return `${a.role}|${a.vehicle}|${a.name}|${a.lat}|${a.lng}`;
}
