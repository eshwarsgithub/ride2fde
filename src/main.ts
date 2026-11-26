import { createMap, type MapController } from "./map";
import type { MapViewName } from "./map-view";
import { fetchAttendees } from "./api";
import { rememberReachToggle, rememberZoneToggle, renderPanel, type PanelOptions } from "./panel";
import { setupAttendeeForm, MY_ID_KEY } from "./form";
import { findMatches, type MatchMode } from "./match";
import { decodePolyline } from "../shared/geo";
import type { Attendee } from "../shared/types";

const POLL_MS = 15_000;
const MODE_KEY = "ride2fde:matchMode";
const VIEW_KEY = "ride2fde:mapView";

/** One map serves all three looks; the standard one is the default. */
let active: MapController;
let activeName: MapViewName = "map";

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
    return saved === "dark" || saved === "3d" ? saved : "map";
  } catch {
    return "map";
  }
}

function draw(focusMine = false) {
  const me = currentUser(latest);
  const matches = me ? findMatches(me, latest, view.mode) : [];

  renderPanel(latest, me, matches, view);
  active.renderAttendees(latest, { meId: me?.id ?? null, matchIds: new Set(matches.map((m) => m.attendee.id)) });
  active.renderRoutes(me, matches.map((m) => m.attendee));

  if (focusMine && me?.route_polyline) active.focusPath(decodePolyline(me.route_polyline));
}

async function refresh(focusMine = false) {
  try {
    latest = await fetchAttendees();
    draw(focusMine);
  } catch (err) {
    console.error("Failed to refresh attendees", err);
  }
}

/** Change the look, then draw the current data onto it. */
async function switchView(name: MapViewName, focusMine = true): Promise<void> {
  try {
    await active.setView(name);
  } catch (err) {
    console.error(`Couldn't switch to the ${name} map`, err);
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
  active = await createMap(document.getElementById("map2d")!); // the standard look is always ready first

  setupAttendeeForm(
    () => {
      active.showPreview(null);
      void refresh(true);
    },
    (polyline) => active.showPreview(polyline)
  );

  document.querySelector(".map-switch")?.addEventListener("click", (e) => {
    const name = (e.target as HTMLElement).closest<HTMLElement>("[data-view]")?.dataset.view;
    if ((name === "map" || name === "dark" || name === "3d") && name !== activeName) void switchView(name);
  });

  // One delegated handler for everything clickable inside the side panel.
  panel.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-mode],[data-more],[data-open-form]");
    if (!target) return;
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

  await refresh(true); // fit the viewer's own route on first load
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
  if (panel) panel.innerHTML = `<p class="empty">The map didn't load. Check your connection and refresh the page.</p>`;
});
