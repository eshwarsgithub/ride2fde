import type { Attendee, AttendeeInput } from "../shared/types";

export async function fetchAttendees(): Promise<Attendee[]> {
  const res = await fetch("/api/attendees");
  if (!res.ok) throw new Error(`Failed to load attendees (${res.status})`);
  const data = await res.json();
  return data.attendees as Attendee[];
}

export async function createAttendee(input: AttendeeInput): Promise<Attendee> {
  const res = await fetch("/api/attendees", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to submit (${res.status})`);
  }
  const data = await res.json();
  return data.attendee as Attendee;
}
