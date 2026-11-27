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

/** A new entry, plus the secret that lets this person change or remove it later. */
export async function createAttendee(input: AttendeeInput): Promise<{ attendee: Attendee; editToken: string }> {
  const res = await fetch("/api/attendees", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to submit"));
  const data = await res.json();
  return { attendee: data.attendee as Attendee, editToken: data.edit_token as string };
}

/** True when the edit code is right for this entry. */
export async function verifyEditCode(id: number, code: string): Promise<boolean> {
  const res = await fetch("/api/attendees?verify=1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, edit_token: code }),
  });
  if (res.status === 403) return false;
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't check the code"));
  return true;
}

export async function updateAttendee(id: number, editToken: string, input: AttendeeInput): Promise<Attendee> {
  const res = await fetch("/api/attendees", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, id, edit_token: editToken }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to save changes"));
  const data = await res.json();
  return data.attendee as Attendee;
}

export async function deleteAttendee(id: number, editToken: string): Promise<void> {
  const res = await fetch("/api/attendees", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, edit_token: editToken }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to remove your entry"));
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
