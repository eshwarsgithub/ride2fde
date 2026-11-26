import type { Attendee, AttendeeInput } from "../shared/types";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return data.error ?? `${fallback} (${res.status})`;
}

export async function fetchAttendees(): Promise<Attendee[]> {
  const res = await fetch("/api/attendees");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load attendees"));
  const data = await res.json();
  return data.attendees as Attendee[];
}

export async function createAttendee(input: AttendeeInput): Promise<Attendee> {
  const res = await fetch("/api/attendees", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to submit"));
  const data = await res.json();
  return data.attendee as Attendee;
}

/** Swap a stored straight-line route for the real road route. The server only allows this for straight-line routes. */
export async function upgradeRoute(id: number, route: { polyline: string; distance_km: number; eta_min: number | null }): Promise<boolean> {
  const res = await fetch("/api/attendees", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, route_polyline: route.polyline, distance_km: route.distance_km, eta_min: route.eta_min }),
  });
  return res.ok;
}
