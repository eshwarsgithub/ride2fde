import { VENUE } from "../shared/zones";
import type { Attendee } from "../shared/types";

// Map3DElement / Marker3DElement are part of the alpha "maps3d" library and
// aren't fully covered by @types/google.maps yet — typed loosely on purpose.
type Map3DElement = HTMLElement & {
  center: { lat: number; lng: number; altitude: number };
};

let marker3dCtor: any;
let attendeeMarkers: any[] = [];

export async function initMap(): Promise<Map3DElement> {
  const lib = (await google.maps.importLibrary("maps3d")) as any;
  marker3dCtor = lib.Marker3DElement;

  const mapEl = document.getElementById("map3d") as Map3DElement;

  const venueMarker = new marker3dCtor({
    position: { lat: VENUE.lat, lng: VENUE.lng, altitude: 50 },
    label: VENUE.name,
    extruded: true,
  });
  mapEl.append(venueMarker);

  return mapEl;
}

export function renderAttendeeMarkers(mapEl: Map3DElement, attendees: Attendee[]): void {
  for (const m of attendeeMarkers) m.remove();
  attendeeMarkers = [];

  for (const a of attendees) {
    const marker = new marker3dCtor({
      position: { lat: a.lat, lng: a.lng, altitude: 30 },
      label: `${a.name} (${a.zone})`,
      extruded: true,
    });
    mapEl.append(marker);
    attendeeMarkers.push(marker);
  }
}
