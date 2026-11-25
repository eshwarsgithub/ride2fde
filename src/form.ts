import { createAttendee } from "./api";
import { routeToVenue, type RouteResult } from "./route";
import {
  CONTACT_LABEL,
  CONTACT_PLACEHOLDER,
  CONTACT_TYPES,
  normalizeContacts,
  type ContactType,
} from "../shared/contacts";
import type { Attendee, AttendeeInput, Role, Vehicle } from "../shared/types";

interface PendingLocation {
  lat: number;
  lng: number;
  /** What the person sees and edits in the box. Never sent to the server. */
  address: string;
  /** A rough area name, like "Miyapur". This is all the server stores. */
  area: string;
}

const HYDERABAD_BOUNDS = {
  north: 17.75,
  south: 17.1,
  east: 78.75,
  west: 78.0,
};

export const MY_ID_KEY = "ride2fde:myId";

/** The neighbourhood-level name from a Google place, so we never store a street address. */
function areaFromComponents(components: google.maps.GeocoderAddressComponent[] | undefined): string {
  if (!components) return "";
  for (const type of ["sublocality_level_1", "sublocality", "neighborhood", "locality"]) {
    const hit = components.find((c) => c.types.includes(type));
    if (hit) return hit.long_name;
  }
  return "";
}

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
  const rowsEl = document.getElementById("contact-rows") as HTMLDivElement;
  const addContactBtn = document.getElementById("add-contact-btn") as HTMLButtonElement;
  const vehicleEl = document.getElementById("vehicle-choice") as HTMLFieldSetElement;

  let pending: PendingLocation | null = null;
  let route: Promise<RouteResult> | null = null;
  let routeToken = 0;

  // ───────────── contact rows: a dropdown for the method + the detail ─────────────

  const rowOf = () => [...rowsEl.querySelectorAll<HTMLDivElement>(".contact-row")];
  const selectOf = (row: HTMLElement) => row.querySelector("select") as HTMLSelectElement;
  const inputOf = (row: HTMLElement) => row.querySelector("input") as HTMLInputElement;

  /** Keeps each method to one row: a type already used elsewhere is greyed out in the other dropdowns. */
  function syncRows(): void {
    const rows = rowOf();
    const used = new Set(rows.map((r) => selectOf(r).value as ContactType));
    for (const row of rows) {
      const select = selectOf(row);
      const input = inputOf(row);
      const type = select.value as ContactType;
      for (const option of select.options) option.disabled = option.value !== type && used.has(option.value as ContactType);
      input.placeholder = CONTACT_PLACEHOLDER[type];
      input.inputMode = type === "linkedin" ? "url" : type === "email" ? "email" : "tel";
      input.setAttribute("aria-label", `${CONTACT_LABEL[type]} details`);
      (row.querySelector(".contact-remove") as HTMLElement).hidden = rows.length === 1;
    }
    addContactBtn.hidden = rows.length >= CONTACT_TYPES.length;
  }

  function addRow(type?: ContactType): void {
    const used = new Set(rowOf().map((r) => selectOf(r).value));
    const chosen = type ?? CONTACT_TYPES.find((t) => !used.has(t));
    if (!chosen) return;

    const row = document.createElement("div");
    row.className = "contact-row";

    const select = document.createElement("select");
    select.setAttribute("aria-label", "How to reach you");
    for (const t of CONTACT_TYPES) {
      const option = document.createElement("option");
      option.value = t;
      option.textContent = CONTACT_LABEL[t];
      select.append(option);
    }
    select.value = chosen;
    select.addEventListener("change", syncRows);

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.maxLength = 120;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "contact-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove this contact");
    remove.addEventListener("click", () => {
      row.remove();
      syncRows();
    });

    row.append(select, input, remove);
    rowsEl.append(row);
    syncRows();
  }

  function resetRows(): void {
    rowsEl.replaceChildren();
    addRow("linkedin"); // first because it's the one that doesn't hand out a phone number
  }

  addContactBtn.addEventListener("click", () => addRow());
  resetRows();

  /** Only ride givers choose a vehicle. */
  const syncVehicle = () => {
    const role = new FormData(form).get("role");
    vehicleEl.hidden = role !== "giver";
  };
  form.addEventListener("change", (e) => {
    if ((e.target as HTMLInputElement).name === "role") syncVehicle();
  });

  // A contact error clears as soon as the person starts fixing it.
  rowsEl.addEventListener("input", () => {
    if (status.dataset.error === "contact") {
      status.dataset.error = "";
      status.textContent = "";
    }
  });

  // ───────────── location + route ─────────────

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
    resetRows();
    syncVehicle();
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
      fields: ["formatted_address", "geometry", "address_components"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const loc = place.geometry?.location;
      if (!loc) return;
      setPending({
        lat: loc.lat(),
        lng: loc.lng(),
        address: place.formatted_address ?? addressInput.value,
        area: areaFromComponents(place.address_components),
      });
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
        let area = "";
        try {
          const { Geocoder } = (await google.maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary;
          const { results } = await new Geocoder().geocode({ location: { lat, lng } });
          address = results[0]?.formatted_address ?? address;
          area = areaFromComponents(results[0]?.address_components);
        } catch (err) {
          console.warn("Reverse geocoding failed, using coordinates", err);
        }
        setPending({ lat, lng, address, area });
      },
      () => {
        status.textContent = "Couldn't get your location — try typing your area instead.";
      }
    );
  });

  // ───────────── submit ─────────────

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pending || !route) {
      status.textContent = "Pick a starting location first.";
      return;
    }

    // Check the contact details before anything is sent.
    const rows = rowOf();
    const { contacts, error } = normalizeContacts(
      rows.map((r) => ({ type: selectOf(r).value, value: inputOf(r).value }))
    );
    if (error) {
      status.textContent = error;
      status.dataset.error = "contact";
      const bad = rows.find((r) => inputOf(r).value.trim() !== "" && !normalizeContacts([{ type: selectOf(r).value, value: inputOf(r).value }]).contacts.length);
      (bad ? inputOf(bad) : inputOf(rows[0])).focus();
      return;
    }

    submitBtn.disabled = true;
    status.textContent = "Adding your route…";

    const fd = new FormData(form);

    try {
      const r = await route;
      const input: AttendeeInput = {
        name: String(fd.get("name") ?? "").trim(),
        role: fd.get("role") as Role,
        vehicle: fd.get("role") === "giver" ? (fd.get("vehicle") as Vehicle) : undefined,
        address: pending.area, // a rough area, not the street address typed in the box
        lat: pending.lat,
        lng: pending.lng,
        route_polyline: r.polyline,
        distance_km: r.distance_km,
        eta_min: r.eta_min ?? undefined,
        contacts,
      };

      const attendee = await createAttendee(input);
      localStorage.setItem(MY_ID_KEY, String(attendee.id));
      localStorage.setItem("ride2fde:lastZone", attendee.zone);

      clearPending();
      form.reset();
      resetRows();
      syncVehicle();
      dialog.close();
      onCreated(attendee);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Something went wrong.";
      submitBtn.disabled = false;
    }
  });
}
