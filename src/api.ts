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
