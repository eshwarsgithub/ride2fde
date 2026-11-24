export type TransportMode = "car" | "bike" | "auto" | "cab" | "public_transport" | "walking";

export interface AttendeeInput {
  name: string;
  phone?: string;
  address: string;
  lat: number;
  lng: number;
  mode: TransportMode;
  distance_km?: number;
  eta_min?: number;
  pooling: boolean;
}

export interface Attendee extends AttendeeInput {
  id: number;
  zone: string;
  created_at: string;
}
