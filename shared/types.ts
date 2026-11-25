export type Role = "giver" | "taker";

export interface AttendeeInput {
  name: string;
  phone?: string;
  role: Role;
  address: string;
  lat: number;
  lng: number;
  /** Encoded polyline (precision 5) of the route from the start point to the venue. */
  route_polyline?: string;
  distance_km?: number;
  eta_min?: number;
}

export interface Attendee extends Omit<AttendeeInput, "route_polyline"> {
  id: number;
  zone: string;
  route_polyline: string | null;
  created_at: string;
}
