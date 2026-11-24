import { createAttendee } from "./api";
import { estimateToVenue } from "./distance";
import type { Attendee, AttendeeInput, TransportMode } from "../shared/types";

interface PendingLocation {
  lat: number;
  lng: number;
  address: string;
}

const HYDERABAD_BOUNDS = {
  north: 17.75,
  south: 17.1,
  east: 78.75,
  west: 78.0,
};

export function setupAttendeeForm(onCreated: (attendee: Attendee) => void): void {
  const dialog = document.getElementById("attendee-dialog") as HTMLDialogElement;
  const form = document.getElementById("attendee-form") as HTMLFormElement;
  const openBtn = document.getElementById("open-form-btn") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement;
  const useLocationBtn = document.getElementById("use-location-btn") as HTMLButtonElement;
  const addressInput = document.getElementById("address-input") as HTMLInputElement;
  const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
  const status = document.getElementById("form-status") as HTMLParagraphElement;

  let pending: PendingLocation | null = null;

  const setPending = (loc: PendingLocation) => {
    pending = loc;
    addressInput.value = loc.address;
    submitBtn.disabled = false;
  };

  openBtn.addEventListener("click", () => {
    status.textContent = "";
    dialog.showModal();
  });

  cancelBtn.addEventListener("click", () => dialog.close());

  google.maps.importLibrary("places").then((lib) => {
    const { Autocomplete } = lib as google.maps.PlacesLibrary;
    const autocomplete = new Autocomplete(addressInput, {
      bounds: HYDERABAD_BOUNDS,
      componentRestrictions: { country: "in" },
      fields: ["formatted_address", "geometry"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const loc = place.geometry?.location;
      if (!loc) return;
      setPending({ lat: loc.lat(), lng: loc.lng(), address: place.formatted_address ?? addressInput.value });
    });
  });

  useLocationBtn.addEventListener("click", async () => {
    if (!navigator.geolocation) {
      status.textContent = "Geolocation isn't available on this device.";
      return;
    }
    status.textContent = "Getting your location…";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const { Geocoder } = (await google.maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary;
        const geocoder = new Geocoder();
        const { results } = await geocoder.geocode({ location: { lat, lng } });
        const address = results[0]?.formatted_address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        setPending({ lat, lng, address });
        status.textContent = "Location set from GPS.";
      },
      () => {
        status.textContent = "Couldn't get your location — try typing your area instead.";
      }
    );
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pending) {
      status.textContent = "Pick a starting location first.";
      return;
    }

    submitBtn.disabled = true;
    status.textContent = "Calculating route to IITH…";

    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const mode = fd.get("mode") as TransportMode;
    const pooling = fd.get("pooling") === "on";

    try {
      const estimate = await estimateToVenue(pending);
      status.textContent = "Submitting…";

      const input: AttendeeInput = {
        name,
        phone: phone || undefined,
        address: pending.address,
        lat: pending.lat,
        lng: pending.lng,
        mode,
        pooling,
        distance_km: estimate?.distance_km,
        eta_min: estimate?.eta_min,
      };

      const attendee = await createAttendee(input);
      onCreated(attendee);
      localStorage.setItem("ride2fde:lastZone", attendee.zone);

      dialog.close();
      form.reset();
      pending = null;
      submitBtn.disabled = true;
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Something went wrong.";
      submitBtn.disabled = false;
    }
  });
}
