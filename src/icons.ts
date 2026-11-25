import type { Vehicle } from "../shared/types";

/**
 * Small line icons for the vehicle a ride giver travels in. Inline SVG, drawn in the current text colour,
 * so they pick up the lime/white/dark of whatever they sit in. Static strings: no user text goes in here.
 */
const PATHS: Record<Vehicle, string> = {
  // a car from the side
  car: `<path d="M4 16v-3.5L6 7h12l2 5.5V16"/><path d="M3 16h18"/><path d="M6.5 11.5h11"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>`,
  // a motorbike from the side
  bike: `<circle cx="6" cy="16.5" r="3"/><circle cx="18" cy="16.5" r="3"/><path d="M6 16.5l3-6h6l3 6"/><path d="M9 10.5H7M15 10.5l-1.5-3H16"/>`,
};

export function vehicleIcon(vehicle: Vehicle, size = 14): string {
  return `<svg class="vehicle-icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${PATHS[vehicle]}</svg>`;
}
