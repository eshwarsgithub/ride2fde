import { MATCH_RADIUS_KM, decodePolyline, nearestOnPath, routeGapKm, type LatLng } from "../shared/geo";
import type { Attendee } from "../shared/types";

/** "best" = givers see takers and takers see givers; "all" = anyone on the same route. */
export type MatchMode = "best" | "all";

export interface Match {
  attendee: Attendee;
  /** how far apart the two routes are, in km (start of one to the route of the other) */
  gapKm: number;
  /** For a giver viewing: how far along their own route this person's start is (pickup order). */
  alongKm: number | null;
}

/**
 * People whose route passes within MATCH_RADIUS_KM of `me` (or vice versa).
 * Givers see them in pickup order along their own route; everyone else sees closest first.
 */
export function findMatches(me: Attendee, all: Attendee[], mode: MatchMode = "best"): Match[] {
  const myPath: LatLng[] | null = me.role === "giver" && me.route_polyline ? decodePolyline(me.route_polyline) : null;

  const matches: Match[] = [];
  for (const attendee of all) {
    if (attendee.id === me.id) continue;
    if (mode === "best" && attendee.role === me.role) continue;
    const gapKm = routeGapKm(me, attendee);
    if (gapKm > MATCH_RADIUS_KM) continue;
    const alongKm = myPath ? nearestOnPath(attendee, myPath).alongKm : null;
    matches.push({ attendee, gapKm, alongKm });
  }

  return matches.sort((a, b) =>
    a.alongKm != null && b.alongKm != null ? a.alongKm - b.alongKm : a.gapKm - b.gapKm
  );
}
