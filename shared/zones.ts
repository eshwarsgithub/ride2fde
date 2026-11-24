// Shared between the frontend (src/) and the Cloudflare Pages Function (functions/).
// Keep this the single source of truth for the venue, zones, and distance math.

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** ids of geographically adjacent zones, used to widen the "people near you" list */
  neighbors: string[];
}

export const VENUE = {
  name: "IIT Hyderabad (Kandi Campus)",
  lat: 17.5947,
  lng: 78.1265,
};

// Zones chosen along the realistic commute corridors into IITH (NH65 / ORR via
// Gachibowli or Patancheru), not just "biggest Hyderabad localities".
export const ZONES: Zone[] = [
  {
    id: "gachibowli",
    name: "Gachibowli / Financial District",
    lat: 17.4401,
    lng: 78.3489,
    neighbors: ["kondapur", "kukatpally"],
  },
  {
    id: "kondapur",
    name: "Kondapur / Hitech City / Madhapur",
    lat: 17.4615,
    lng: 78.3686,
    neighbors: ["gachibowli", "kukatpally", "banjarahills"],
  },
  {
    id: "kukatpally",
    name: "Kukatpally / KPHB / Miyapur",
    lat: 17.4849,
    lng: 78.4108,
    neighbors: ["kondapur", "gachibowli", "patancheru", "secunderabad"],
  },
  {
    id: "patancheru",
    name: "Patancheru / Bollaram / Sangareddy",
    lat: 17.5308,
    lng: 78.2654,
    neighbors: ["kukatpally"],
  },
  {
    id: "secunderabad",
    name: "Secunderabad / Begumpet / Ameerpet",
    lat: 17.4399,
    lng: 78.4983,
    neighbors: ["kukatpally", "banjarahills", "dilsukhnagar"],
  },
  {
    id: "banjarahills",
    name: "Banjara Hills / Jubilee Hills / Somajiguda",
    lat: 17.4156,
    lng: 78.4347,
    neighbors: ["kondapur", "secunderabad"],
  },
  {
    id: "dilsukhnagar",
    name: "Dilsukhnagar / LB Nagar / Uppal / ECIL",
    lat: 17.3687,
    lng: 78.5247,
    neighbors: ["secunderabad"],
  },
  {
    id: "other",
    name: "Other / Outside Hyderabad",
    lat: VENUE.lat,
    lng: VENUE.lng,
    neighbors: [],
  },
];

export function zoneById(id: string): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** Nearest-centroid zone assignment for a raw lat/lng (no "other" fallback — always picks closest real zone). */
export function nearestZone(point: { lat: number; lng: number }): Zone {
  const real = ZONES.filter((z) => z.id !== "other");
  let best = real[0];
  let bestDist = haversineKm(point, best);
  for (const z of real.slice(1)) {
    const d = haversineKm(point, z);
    if (d < bestDist) {
      best = z;
      bestDist = d;
    }
  }
  return best;
}
