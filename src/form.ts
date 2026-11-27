import { createAttendee, deleteAttendee, updateAttendee, verifyEditCode } from "./api";
import { routeToVenue, type RouteResult } from "./route";
import { attachPlaceSearch, reverseGeocode } from "./search";
import {
  CONTACT_LABEL,
  CONTACT_PLACEHOLDER,
  CONTACT_TYPES,
  normalizeContacts,
  type ContactType,
} from "../shared/contacts";
import { MIN_NAME_LENGTH, normalizeEditCode, type Attendee, type AttendeeInput, type Role, type Vehicle } from "../shared/types";

interface PendingLocation {
  lat: number;
  lng: number;
  /** What the person sees and edits in the box. Never sent to the server. */
  address: string;
  /** A rough area name, like "Miyapur". This is all the server stores. */
  area: string;
}

export const MY_ID_KEY = "ride2fde:myId";
/** The secret that lets this browser edit or remove its own entry. Set when the entry is added. */
export const EDIT_TOKEN_KEY = "ride2fde:editToken";

/** This browser's own entry id and secret, if it can edit one. */
export function myEditAccess(): { id: number; token: string } | null {
  try {
    const id = Number(localStorage.getItem(MY_ID_KEY));
    const token = localStorage.getItem(EDIT_TOKEN_KEY);
    return Number.isInteger(id) && id > 0 && token ? { id, token } : null;
  } catch {
    return null;
  }
}

/** Opening a private edit link (/#edit=ID.CODE) gives this browser access to that entry. The secret is then removed from the address bar. */
export function adoptEditLink(): void {
  const m = /^#edit=(\d+)\.([A-Za-z0-9]+)$/.exec(location.hash);
  const code = m && normalizeEditCode(m[2]);
  if (!m || !code) return;
  try {
    localStorage.setItem(MY_ID_KEY, m[1]);
    localStorage.setItem(EDIT_TOKEN_KEY, code);
  } catch {
    /* storage unavailable: the link can't be remembered */
  }
  history.replaceState(null, "", location.pathname + location.search + "#ride");
  document.getElementById("ride")?.scrollIntoView();
}

export function setupAttendeeForm(
  getMine: () => Attendee | null,
  onCreated: (attendee: Attendee | null) => void,
  onPreview: (polyline: string | null) => void
): { editEntry: (a: Attendee) => void } {
  const dialog = document.getElementById("attendee-dialog") as HTMLDialogElement;
  const form = document.getElementById("attendee-form") as HTMLFormElement;
  const openBtn = document.getElementById("open-form-btn") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement;
  const useLocationBtn = document.getElementById("use-location-btn") as HTMLButtonElement;
  const addressInput = document.getElementById("address-input") as HTMLInputElement;
  const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
  const status = document.getElementById("form-status") as HTMLParagraphElement;
  const rowsEl = document.getElementById("contact-rows") as HTMLDivElement;
  // shown right under the contact boxes: on a phone the status line at the bottom of the form is off-screen
  const contactError = document.getElementById("contact-error") as HTMLParagraphElement;
  const addContactBtn = document.getElementById("add-contact-btn") as HTMLButtonElement;
  const vehicleEl = document.getElementById("vehicle-choice") as HTMLFieldSetElement;
  const titleEl = document.getElementById("form-title") as HTMLHeadingElement;
  const hintEl = document.getElementById("form-hint") as HTMLParagraphElement;
  const removeBtn = document.getElementById("remove-btn") as HTMLButtonElement;
  const savedDialog = document.getElementById("saved-dialog") as HTMLDialogElement;
  const codeEl = document.getElementById("edit-code") as HTMLInputElement;
  const copyCodeBtn = document.getElementById("copy-code-btn") as HTMLButtonElement;
  const shareCodeBtn = document.getElementById("share-code-btn") as HTMLButtonElement;
  const codeDialog = document.getElementById("code-dialog") as HTMLDialogElement;
  const codeForm = document.getElementById("code-form") as HTMLFormElement;
  const codeHint = document.getElementById("code-hint") as HTMLParagraphElement;
  const codeInput = document.getElementById("code-input") as HTMLInputElement;
  const codeError = document.getElementById("code-error") as HTMLParagraphElement;
  const codeCancel = document.getElementById("code-cancel") as HTMLButtonElement;

  /** Set while the person is changing their own entry instead of adding one. */
  let editing: { id: number; token: string } | null = null;

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
      // a phone number is 10 digits; room for a +91 prefix and spaces, but not a paragraph
      input.maxLength = type === "whatsapp" || type === "phone" ? 16 : 120;
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
  const clearContactError = () => {
    contactError.hidden = true;
    contactError.textContent = "";
    rowsEl.querySelectorAll("[aria-invalid]").forEach((el) => {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
  };
  rowsEl.addEventListener("input", clearContactError);
  rowsEl.addEventListener("change", clearContactError); // switching WhatsApp ↔ LinkedIn etc.

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
        : `Couldn't reach the routing service, so this is a straight line (~${r.distance_km} km). It switches to the road route automatically.`;
    });
  };

  function setEditing(access: { id: number; token: string } | null): void {
    editing = access;
    titleEl.textContent = access ? "Edit your route" : "Pin your start point";
    hintEl.hidden = access !== null;
    submitBtn.textContent = access ? "Save changes" : "Add my route";
    removeBtn.hidden = access === null;
  }

  /** Fills the form with the person's current entry. */
  function fillFrom(a: Attendee): void {
    (form.elements.namedItem("name") as HTMLInputElement).value = a.name;
    const role = form.querySelector<HTMLInputElement>(`input[name="role"][value="${a.role}"]`);
    if (role) role.checked = true;
    const vehicle = form.querySelector<HTMLInputElement>(`input[name="vehicle"][value="${a.vehicle ?? "car"}"]`);
    if (vehicle) vehicle.checked = true;
    syncVehicle();
    rowsEl.replaceChildren();
    if (a.contacts.length === 0) addRow("linkedin");
    for (const c of a.contacts) {
      addRow(c.type as ContactType);
      inputOf(rowOf()[rowOf().length - 1]).value = c.value;
    }
    // the stored start is already a rough spot; the route is looked up again from it
    setPending({ lat: a.lat, lng: a.lng, address: a.address, area: a.address });
  }

  /** Opens the form filled with an entry this browser has the code for. */
  function startEdit(a: Attendee, access: { id: number; token: string }): void {
    status.textContent = "";
    clearPending();
    setEditing(access);
    fillFrom(a);
    dialog.showModal();
  }

  openBtn.addEventListener("click", () => {
    status.textContent = "";
    const mine = getMine();
    const access = myEditAccess();
    const wasEditing = editing !== null;
    if (mine && access && access.id === mine.id) {
      startEdit(mine, access);
      return;
    } else {
      setEditing(null);
      if (wasEditing) {
        clearPending();
        form.reset();
        resetRows();
        syncVehicle();
      }
    }
    dialog.showModal();
  });

  removeBtn.addEventListener("click", async () => {
    if (!editing) return;
    if (!confirm("Remove your entry from the map? This can't be undone.")) return;
    removeBtn.disabled = true;
    try {
      await deleteAttendee(editing.id, editing.token);
      try {
        localStorage.removeItem(MY_ID_KEY);
        localStorage.removeItem(EDIT_TOKEN_KEY);
        localStorage.removeItem("ride2fde:lastZone");
      } catch {
        /* storage unavailable */
      }
      closeDialog();
      onCreated(null);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Something went wrong.";
    } finally {
      removeBtn.disabled = false;
    }
  });

  copyCodeBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeEl.value);
      copyCodeBtn.textContent = "Copied";
    } catch {
      codeEl.select(); // clipboard blocked: let them copy by hand
    }
  });

  // On a phone this opens the share sheet (WhatsApp, email, notes…), so the code can be sent to yourself.
  shareCodeBtn.hidden = typeof navigator.share !== "function";
  shareCodeBtn.addEventListener("click", () => {
    const access = myEditAccess();
    const link = access ? `${location.origin}/#edit=${access.id}.${access.token}` : location.origin;
    navigator
      .share({ title: "ride2fde edit code", text: `My ride2fde edit code: ${codeEl.value}\nOr open: ${link}` })
      .catch(() => {
        /* closed without sending */
      });
  });

  // ───────────── "Edit" beside a name: ask for that entry's code ─────────────

  let askedFor: Attendee | null = null;

  function editEntry(a: Attendee): void {
    const access = myEditAccess();
    if (access && access.id === a.id) {
      startEdit(a, access); // this browser made the entry, so no code is needed
      return;
    }
    askedFor = a;
    codeHint.textContent = `Enter the edit code for ${a.name}. You were shown it when the route was added.`;
    codeInput.value = "";
    codeError.hidden = true;
    codeDialog.showModal();
    codeInput.focus();
  }

  codeInput.addEventListener("input", () => (codeError.hidden = true));
  codeCancel.addEventListener("click", () => codeDialog.close());
  codeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const a = askedFor;
    const code = normalizeEditCode(codeInput.value);
    if (!a) return;
    if (!code) {
      codeError.textContent = "The code is three letters and four numbers, like shi4829.";
      codeError.hidden = false;
      return;
    }
    try {
      if (!(await verifyEditCode(a.id, code))) {
        codeError.textContent = "That code doesn't match this entry. Check it and try again.";
        codeError.hidden = false;
        return;
      }
    } catch (err) {
      codeError.textContent = err instanceof Error ? err.message : "Something went wrong.";
      codeError.hidden = false;
      return;
    }
    try {
      localStorage.setItem(MY_ID_KEY, String(a.id));
      localStorage.setItem(EDIT_TOKEN_KEY, code);
    } catch {
      /* storage unavailable: it works for this visit only */
    }
    codeDialog.close();
    onCreated(a); // redraw so the page knows this is "you" now
    startEdit(a, { id: a.id, token: code });
  });

  function closeDialog(): void {
    setEditing(null);
    clearPending();
    form.reset();
    resetRows();
    clearContactError();
    syncVehicle();
    status.textContent = "";
    dialog.close();
  }
  cancelBtn.addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", () => clearPending()); // Esc key

  // Typing a new address invalidates the previously picked place.
  addressInput.addEventListener("input", () => {
    if (pending) clearPending();
  });

  attachPlaceSearch(addressInput, document.getElementById("address-suggestions") as HTMLUListElement, (place) =>
    setPending({ lat: place.lat, lng: place.lng, address: place.label, area: place.area })
  );

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
          const place = await reverseGeocode(lat, lng);
          if (place) {
            address = place.label;
            area = place.area;
          }
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
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    if (nameInput.value.trim().length < MIN_NAME_LENGTH) {
      status.textContent = `Please enter your name (at least ${MIN_NAME_LENGTH} characters).`;
      delete status.dataset.error;
      nameInput.focus();
      return;
    }

    const { contacts, error } = normalizeContacts(
      rows.map((r) => ({ type: selectOf(r).value, value: inputOf(r).value }))
    );
    if (error) {
      const bad = rows.find((r) => inputOf(r).value.trim() !== "" && !normalizeContacts([{ type: selectOf(r).value, value: inputOf(r).value }]).contacts.length);
      const field = bad ? inputOf(bad) : inputOf(rows[0]);
      contactError.textContent = error;
      contactError.hidden = false;
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", "contact-error");
      field.focus();
      contactError.scrollIntoView({ block: "nearest" });
      return;
    }

    submitBtn.disabled = true;
    status.textContent = editing ? "Saving your changes…" : "Adding your route…";

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

      let attendee: Attendee;
      let newToken: string | null = null;
      if (editing) {
        attendee = await updateAttendee(editing.id, editing.token, input);
      } else {
        const created = await createAttendee(input);
        attendee = created.attendee;
        newToken = created.editToken;
        localStorage.setItem(MY_ID_KEY, String(attendee.id));
        localStorage.setItem(EDIT_TOKEN_KEY, newToken);
      }
      localStorage.setItem("ride2fde:lastZone", attendee.zone);
      setEditing(null);

      clearPending();
      form.reset();
      resetRows();
      clearContactError();
      syncVehicle();
      dialog.close();
      onCreated(attendee);
      if (newToken) {
        codeEl.value = newToken;
        copyCodeBtn.textContent = "Copy code";
        void navigator.clipboard?.writeText(codeEl.value).catch(() => {}); // may be blocked; the button is the fallback
        savedDialog.showModal();
      }
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Something went wrong.";
      submitBtn.disabled = false;
    }
  });

  return { editEntry };
}
