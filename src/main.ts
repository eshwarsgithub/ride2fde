import type { MapController } from "./map";
import type { MapView, MapViewName } from "./map-view";
import { fetchAttendees, upgradeRoute } from "./api";
import { roadRoute } from "./route";
import { rememberReachToggle, rememberZoneToggle, renderPanel, type PanelOptions } from "./panel";
import { adoptEditLink, myEditAccess, setupAttendeeForm, MY_ID_KEY } from "./form";
import { findMatches, type MatchMode } from "./match";
import { decodePolyline, isStraightLine } from "../shared/geo";
import type { Attendee } from "../shared/types";

const POLL_MS = 15_000;
const MODE_KEY = "ride2fde:matchMode";
const VIEW_KEY = "ride2fde:mapView";

/** The free OpenStreetMap map serves the Map, Dark and 3D looks. Undefined until it has loaded. */
let osm: MapController | undefined;
/** The optional Google view, created the first time someone picks it. */
let googleMap: MapView | undefined;
/** Whichever map is showing right now. */
let active: MapView | undefined;
let activeName: MapViewName = "map";

/** The Google button only exists when the site was built with a Google key. */
const GOOGLE_AVAILABLE = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
/** Set when Google refused (key problem or daily limit reached): don't offer it again this visit. */
let googleBlocked = false;

const view: PanelOptions = { mode: readMode(), showAll: false };
let latest: Attendee[] = [];

function readMode(): MatchMode {
  try {
    return localStorage.getItem(MODE_KEY) === "all" ? "all" : "best";
  } catch {
    return "best";
  }
}

function currentUser(attendees: Attendee[]): Attendee | null {
  const id = Number(localStorage.getItem(MY_ID_KEY));
  return Number.isFinite(id) && id > 0 ? attendees.find((a) => a.id === id) ?? null : null;
}

function readView(): MapViewName {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "google") return GOOGLE_AVAILABLE ? "google" : "map";
    return saved === "dark" || saved === "3d" ? saved : "map";
  } catch {
    return "map";
  }
}

function draw(focusMine = false) {
  const me = currentUser(latest);
  const matches = me ? findMatches(me, latest, view.mode) : [];
  const openBtn = document.getElementById("open-form-btn");
  if (openBtn) openBtn.textContent = me && myEditAccess()?.id === me.id ? "Edit my entry" : "I'm coming too";

  renderPanel(latest, me, matches, view);
  if (!active) return; // the panel shows straight away; the map catches up when it has loaded
  active.renderAttendees(latest, { meId: me?.id ?? null, matchIds: new Set(matches.map((m) => m.attendee.id)) });
  active.renderRoutes(me, matches.map((m) => m.attendee));

  if (focusMine && me?.route_polyline) active.focusPath(decodePolyline(me.route_polyline));
}

async function refresh(focusMine = false) {
  try {
    latest = await fetchAttendees();
    draw(focusMine);
    void upgradeStraightRoutes();
  } catch (err) {
    console.error("Failed to refresh attendees", err);
  }
}

/** Attendees whose straight-line route we've already tried to upgrade this visit, so a failure isn't retried every poll. */
const upgradeTried = new Set<number>();
let upgrading = false;

/** Straight-line routes were saved while the routing service was down. Fetch the road route for them and save it. */
async function upgradeStraightRoutes(): Promise<void> {
  if (upgrading) return;
  const todo = latest.filter((a) => isStraightLine(a.route_polyline) && !upgradeTried.has(a.id)).slice(0, 3);
  if (todo.length === 0) return;
  upgrading = true;
  let changed = false;
  try {
    for (const a of todo) {
      upgradeTried.add(a.id);
      const route = await roadRoute({ lat: a.lat, lng: a.lng });
      if (route && (await upgradeRoute(a.id, route))) changed = true;
    }
  } catch (err) {
    console.warn("Couldn't upgrade a straight-line route", err);
  } finally {
    upgrading = false;
  }
  if (changed) void refresh();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(text: string): void {
  const toast = document.getElementById("map-toast")!;
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 8000);
}

/** Google refused to draw (quota used up, or a key problem): go back to the free map and say why. */
function googleFailed(): void {
  googleBlocked = true;
  const button = document.querySelector<HTMLButtonElement>('.map-switch [data-view="google"]');
  if (button) {
    button.disabled = true;
    button.title = "Google Maps isn't available right now";
  }
  showToast("Google Maps isn't available right now (its daily limit may be used up). Showing the free map instead.");
  if (activeName === "google") void switchView("map");
}

/** Show the Google wrapper or the OpenStreetMap map, never both. */
function showLayer(google: boolean): void {
  document.getElementById("map-google")!.hidden = !google;
  document.getElementById("map2d")!.hidden = google;
}

/** Change the look, then draw the current data onto it. */
async function switchView(name: MapViewName, focusMine = true): Promise<void> {
  try {
    if (name === "google") {
      if (!GOOGLE_AVAILABLE || googleBlocked) return;
      showLayer(true); // Google needs a visible, sized container when it's created
      if (!googleMap) {
        const canvas = document.querySelector<HTMLElement>("#map-google .map-google-canvas")!;
        const { createGoogleMap } = await import("./map-google");
        googleMap = await createGoogleMap(canvas, googleFailed);
      }
      if (googleBlocked) return; // it failed while loading; googleFailed already switched back
      active = googleMap;
    } else {
      if (!osm) return;
      showLayer(false);
      await osm.setView(name);
      active = osm;
    }
  } catch (err) {
    console.error(`Couldn't switch to the ${name} map`, err);
    if (name === "google") googleFailed();
    return;
  }
  activeName = name;

  document.querySelectorAll<HTMLButtonElement>(".map-switch button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === name));
  });
  try {
    localStorage.setItem(VIEW_KEY, name);
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
  draw(focusMine);
}

async function main() {
  const panel = document.getElementById("zone-panel")!;

  // The map library is most of the JavaScript, so it loads in parallel: the people list doesn't wait for it.
  const mapReady = import("./map").then(({ createMap }) => createMap(document.getElementById("map2d")!));
  const listReady = refresh();

  adoptEditLink();
  const form = setupAttendeeForm(
    () => currentUser(latest),
    () => {
      active?.showPreview(null);
      void refresh(true);
    },
    (polyline) => active?.showPreview(polyline)
  );

  document.querySelector(".map-switch")?.addEventListener("click", (e) => {
    const name = (e.target as HTMLElement).closest<HTMLElement>("[data-view]")?.dataset.view;
    if ((name === "map" || name === "dark" || name === "3d" || name === "google") && name !== activeName) void switchView(name);
  });

  // One delegated handler for everything clickable inside the side panel.
  panel.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-mode],[data-more],[data-open-form],[data-edit-id]");
    if (!target) return;
    if (target.dataset.editId) {
      const person = latest.find((a) => a.id === Number(target.dataset.editId));
      if (person) form.editEntry(person);
      return;
    }
    if (target.dataset.openForm) document.getElementById("open-form-btn")?.click();
    if (target.dataset.mode) {
      view.mode = target.dataset.mode === "all" ? "all" : "best";
      view.showAll = false;
      try {
        localStorage.setItem(MODE_KEY, view.mode);
      } catch {
        /* storage unavailable: the choice just won't persist */
      }
      draw();
    }
    if (target.dataset.more) {
      view.showAll = target.dataset.more === "1";
      draw();
    }
  });
  // <details> toggles don't bubble, so listen in the capture phase.
  panel.addEventListener(
    "toggle",
    (e) => {
      const el = e.target as HTMLDetailsElement;
      if (el.dataset?.zone) rememberZoneToggle(el.dataset.zone, el.open);
      if (el.dataset?.reach) rememberReachToggle(Number(el.dataset.reach), el.open);
    },
    true
  );

  if (GOOGLE_AVAILABLE) {
    const button = document.querySelector<HTMLButtonElement>('.map-switch [data-view="google"]');
    if (button) button.hidden = false;
  }

  try {
    osm = await mapReady;
    active = osm;
  } catch (err) {
    console.error("The map didn't load", err);
    document.getElementById("map2d")?.insertAdjacentHTML("beforeend", `<p class="map-error">The map didn't load. The list still works; refresh to try again.</p>`);
  }
  await listReady;
  draw(true); // now on the map too, fitted to the viewer's own route
  if (readView() !== "map") await switchView(readView(), true); // only if they chose another look before
  setInterval(() => {
    if (!document.hidden) void refresh(); // don't poll for a tab nobody is looking at
  }, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
}

main().catch((err) => {
  console.error(err);
  const panel = document.getElementById("zone-panel");
  if (panel) panel.innerHTML = `<p class="empty">Something went wrong loading the page. Check your connection and refresh.</p>`;
});
