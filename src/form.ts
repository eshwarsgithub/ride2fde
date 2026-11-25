import { createAttendee } from "./api";
import { routeToVenue, type RouteResult } from "./route";
import type { Attendee, AttendeeInput, Role } from "../shared/types";

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

export const MY_ID_KEY = "ride2fde:myId";

export function setupAttendeeForm(
  onCreated: (attendee: Attendee) => void,
  onPreview: (polyline: string | null) => void
): void {
  const dialog = document.getElementById("attendee-dialog") as HTMLDialogElement;
  const form = document.getElementById("attendee-form") as HTMLFormElement;
  const openBtn = document.getElementById("open-form-btn") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement;
  const useLocationBtn = document.getElementById("use-location-btn") as HTMLButtonElement;
  const addressInput = document.getElementById("address-input") as HTMLInputElement;
  const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
  const status = document.getElementById("form-status") as HTMLParagraphElement;

  let pending: PendingLocation | null = null;
  let route: Promise<RouteResult> | null = null;
  let routeToken = 0;

  const clearPending = () => {
    pending = null;
    route = null;
    routeToken++;
    submitBtn.disabled = true;
    onPreview(null);
  };

  const setPending = (loc: PendingLocation) => {
    pending = loc;
    addressInput.value = loc.address;
    submitBtn.disabled = false;

    // Start the route lookup now so the route is drawn on the map while the user finishes the form.
    const token = ++routeToken;
    status.textContent = "Finding your route to IITH…";
    route = routeToVenue(loc);
    void route.then((r) => {
      if (token !== routeToken) return; // location changed meanwhile
      onPreview(r.polyline);
      const eta = r.eta_min != null ? ` · ~${r.eta_min} min` : "";
      status.textContent = r.exact
        ? `Route found: ${r.distance_km} km${eta}`
        : `Showing a straight-line route (~${r.distance_km} km).`;
    });
  };

  openBtn.addEventListener("click", () => {
    status.textContent = "";
    dialog.showModal();
  });

  const closeDialog = () => {
    clearPending();
    form.reset();
    status.textContent = "";
    dialog.close();
  };
  cancelBtn.addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", () => clearPending()); // Esc key

  // Typing a new address invalidates the previously picked place.
  addressInput.addEventListener("input", () => {
    if (pending) clearPending();
  });

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

  useLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      status.textContent = "Geolocation isn't available on this device.";
      return;
    }
    status.textContent = "Getting your location…";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        try {
          const { Geocoder } = (await google.maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary;
          const { results } = await new Geocoder().geocode({ location: { lat, lng } });
          address = results[0]?.formatted_address ?? address;
        } catch (err) {
          console.warn("Reverse geocoding failed, using coordinates", err);
        }
        setPending({ lat, lng, address });
      },
      () => {
        status.textContent = "Couldn't get your location — try typing your area instead.";
      }
    );
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pending || !route) {
      status.textContent = "Pick a starting location first.";
      return;
    }

    submitBtn.disabled = true;
    status.textContent = "Submitting…";

    const fd = new FormData(form);
    const phone = String(fd.get("phone") ?? "").trim();

    try {
      const r = await route;
      const input: AttendeeInput = {
        name: String(fd.get("name") ?? "").trim(),
        phone: phone || undefined,
        role: fd.get("role") as Role,
        address: pending.address,
        lat: pending.lat,
        lng: pending.lng,
        route_polyline: r.polyline,
        distance_km: r.distance_km,
        eta_min: r.eta_min ?? undefined,
      };

      const attendee = await createAttendee(input);
      localStorage.setItem(MY_ID_KEY, String(attendee.id));
      localStorage.setItem("ride2fde:lastZone", attendee.zone);

      clearPending();
      form.reset();
      dialog.close();
      onCreated(attendee);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Something went wrong.";
      submitBtn.disabled = false;
    }
  });
}
