import type { Contact } from "./contacts";

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
  created_at: string;
}
