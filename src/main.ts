import { initMap, renderAttendeeMarkers, renderRoutes, showPreviewRoute, focusPath } from "./map";
import { fetchAttendees } from "./api";
import { renderPanel, rememberZoneToggle, type PanelOptions } from "./panel";
import { setupAttendeeForm, MY_ID_KEY } from "./form";
import { findMatches, type MatchMode } from "./match";
import { decodePolyline } from "../shared/geo";
import type { Attendee } from "../shared/types";

const POLL_MS = 15_000;
const MODE_KEY = "ride2fde:matchMode";

type MapEl = Awaited<ReturnType<typeof initMap>>;

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

function draw(mapEl: MapEl, focusMine = false) {
  const me = currentUser(latest);
  const matches = me ? findMatches(me, latest, view.mode) : [];

  renderPanel(latest, me, matches, view);
  renderAttendeeMarkers(mapEl, latest);
  renderRoutes(mapEl, me, matches.map((m) => m.attendee));

  if (focusMine && me?.route_polyline) focusPath(mapEl, decodePolyline(me.route_polyline));
}

async function refresh(mapEl: MapEl, focusMine = false) {
  try {
    latest = await fetchAttendees();
    draw(mapEl, focusMine);
  } catch (err) {
    console.error("Failed to refresh attendees", err);
  }
}

async function main() {
  const mapEl = await initMap();
  const panel = document.getElementById("zone-panel")!;

  setupAttendeeForm(
    () => {
      showPreviewRoute(mapEl, null);
      void refresh(mapEl, true);
    },
    (polyline) => showPreviewRoute(mapEl, polyline)
  );

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
      draw(mapEl);
    }
    if (target.dataset.more) {
      view.showAll = target.dataset.more === "1";
      draw(mapEl);
    }
  });
  // <details> toggles don't bubble, so listen in the capture phase.
  panel.addEventListener(
    "toggle",
    (e) => {
      const el = e.target as HTMLDetailsElement;
      if (el.dataset?.zone) rememberZoneToggle(el.dataset.zone, el.open);
    },
    true
  );

  await refresh(mapEl, true); // fit the viewer's own route on first load
  setInterval(() => {
    if (!document.hidden) void refresh(mapEl); // don't poll for a tab nobody is looking at
  }, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh(mapEl);
  });
}

main().catch((err) => {
  console.error(err);
  const panel = document.getElementById("zone-panel");
  if (panel) panel.innerHTML = `<p class="empty">The map didn't load. Check your connection and refresh the page.</p>`;
});
