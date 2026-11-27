import type { Contact } from "./contacts";

/** Shortest name the form and the server accept (after trimming spaces). */
export const MIN_NAME_LENGTH = 3;
export const MAX_NAME_LENGTH = 80;

export type Role = "giver" | "taker";

/** What a ride giver travels in. Takers have none. */
export type Vehicle = "car" | "bike";

export const VEHICLES: Vehicle[] = ["car", "bike"];
export const VEHICLE_LABEL: Record<Vehicle, string> = { car: "Car", bike: "Bike" };
/** How many people it can take, so a ride taker can tell at a glance. */
export const VEHICLE_SEATS: Record<Vehicle, string> = { car: "a few seats", bike: "1 seat" };

/** What the browser sends when someone adds their route. */
export interface AttendeeInput {
  name: string;
  role: Role;
  /** Required for ride givers: "car" or "bike". Ignored for takers. */
  vehicle?: Vehicle;
  /** A rough area name ("Miyapur"), never a street address. The server fills it in if it's empty. */
  address?: string;
  lat: number;
  lng: number;
  /** Encoded polyline (precision 5) of the route from the start point to the venue. */
  route_polyline?: string;
  distance_km?: number;
  eta_min?: number;
  /** The ways this person chose to be reached (LinkedIn, WhatsApp, phone). */
  contacts?: Contact[];
}

/**
 * Edit codes are short so people can remember them: three letters from the name plus four digits, like shi4829.
 * That is easy to guess on its own, so the server locks an entry after a few wrong codes (see migration 0006).
 */
export const EDIT_CODE_PATTERN = /^[a-z]{3}\d{4}$/;

/** What the person types or pastes -> the plain code (shi4829), or null if it can't be one. Case, spaces and dashes don't matter. */
export function normalizeEditCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  return EDIT_CODE_PATTERN.test(code) ? code : null;
}

export interface Attendee {
  id: number;
  name: string;
  role: Role;
  vehicle: Vehicle | null;
  address: string;
  lat: number;
  lng: number;
  zone: string;
  route_polyline: string | null;
  distance_km: number | null;
  eta_min: number | null;
  contacts: Contact[];
  /** Whether this entry has an edit code, so the list can offer "Edit". The code itself is never sent. */
  editable: boolean;
  created_at: string;
}
