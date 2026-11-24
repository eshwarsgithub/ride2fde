import { VENUE } from "../shared/zones";

export interface DrivingEstimate {
  distance_km: number;
  eta_min: number;
}

/** Driving distance/ETA from a point to the venue, via the Distance Matrix service. */
export async function estimateToVenue(point: { lat: number; lng: number }): Promise<DrivingEstimate | null> {
  const { DistanceMatrixService } = (await google.maps.importLibrary(
    "routes"
  )) as google.maps.RoutesLibrary;

  const service = new DistanceMatrixService();
  const response = await service.getDistanceMatrix({
    origins: [point],
    destinations: [{ lat: VENUE.lat, lng: VENUE.lng }],
    travelMode: google.maps.TravelMode.DRIVING,
  });

  const element = response.rows[0]?.elements[0];
  if (!element || element.status !== "OK" || !element.distance || !element.duration) {
    return null;
  }

  return {
    distance_km: Math.round((element.distance.value / 1000) * 10) / 10,
    eta_min: Math.round(element.duration.value / 60),
  };
}
