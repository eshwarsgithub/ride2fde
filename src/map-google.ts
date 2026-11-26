/// <reference types="google.maps" />
import { VENUE } from "../shared/zones";
import { decodePolyline, type LatLng } from "../shared/geo";
import { COLORS, MAX_DRAWN_ROUTES, markerKey, routesSignature, type MapView, type Relations } from "./map-view";
import type { Attendee, Vehicle } from "../shared/types";
import { vehicleIcon } from "./icons";

/**
 * The optional Google Maps view (the "Google" button). The default map is the free OpenStreetMap one; this exists
 * so people can switch to Google's map when the site has a Google key with quota left.
 *
 * It needs `VITE_GOOGLE_MAPS_API_KEY` at build time. Without it the button is hidden. Google's script is only
 * downloaded when someone picks this view, so it costs nothing otherwise. Address search and routing stay on the
 * free OpenStreetMap services either way.
 */
export const GOOGLE_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

/** Names of people who are neither you nor on your way appear only when zoomed in this far. */
const LABEL_ZOOM = 13;

type PinKind = "me" | "match" | "other" | "venue";

function tagText(kind: PinKind, a?: Attendee): string {
  if (kind === "me") return "YOU";
  if (kind === "venue") return "IIT HYDERABAD · KANDI";
  return (a?.name ?? "").split(" ")[0].toUpperCase();
}

let loading: Promise<void> | undefined;

/** Loads Google's Maps JavaScript API once. Rejects if the key is refused. */
function loadGoogle(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    w.__ride2fdeGoogleReady = () => resolve();
    const params = new URLSearchParams({ key: GOOGLE_KEY, v: "weekly", loading: "async", callback: "__ride2fdeGoogleReady" });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps couldn't be downloaded"));
    document.head.append(script);
  });
  return loading;
}

/**
 * Google shows its own "Oops! Something went wrong" box instead of throwing when the key is refused or the daily
 * quota is used up. This watches for that box (and Google's auth-failure hook) so the app can switch back to the
 * free map instead of leaving people looking at an error.
 */
function watchForGoogleFailure(container: HTMLElement, onFail: () => void): void {
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    observer.disconnect();
    onFail();
  };
  (window as unknown as Record<string, unknown>).gm_authFailure = fail;
  const observer = new MutationObserver(() => {
    if (container.querySelector(".gm-err-container, .gm-err-message")) fail();
  });
  observer.observe(container, { childList: true, subtree: true });
}

export async function createGoogleMap(container: HTMLElement, onFail: () => void): Promise<MapView> {
  await loadGoogle();
  watchForGoogleFailure(container, onFail);
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  const map = new Map(container, {
    center: { lat: VENUE.lat, lng: VENUE.lng },
    zoom: 11,
    backgroundColor: "#e5e3df", // Google's own land colour, shown while tiles load
    disableDefaultUI: true, // we add our own zoom buttons and legend, matching the other views
    clickableIcons: false,
    // Phones: one finger scrolls the page and two fingers move the map, so the map never traps scrolling.
    gestureHandling: window.matchMedia("(pointer: coarse)").matches ? "cooperative" : "greedy",
    minZoom: 8,
    maxZoom: 17,
  });

  /** A DOM marker, styled by the same CSS as the other views' pins. */
  class Pin extends google.maps.OverlayView {
    readonly el = document.createElement("div");

    constructor(
      private readonly position: google.maps.LatLngLiteral,
      kind: PinKind,
      tag: string,
      vehicle: Vehicle | null = null
    ) {
      super();
      this.el.className = `pin ${kind}`;
      const dot = document.createElement("span");
      dot.className = "pin-dot";
      const label = document.createElement("span");
      label.className = "pin-label";
      if (vehicle) label.insertAdjacentHTML("beforeend", vehicleIcon(vehicle, 18)); // a fixed icon, never user text
      label.append(tag); // appended as text, so a name can never inject markup
      this.el.append(dot, label);
    }

    onAdd() {
      this.getPanes()?.overlayMouseTarget.appendChild(this.el); // above the route lines
    }

    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(this.position));
      if (!point) return;
      this.el.style.left = `${point.x}px`;
      this.el.style.top = `${point.y}px`;
    }

    onRemove() {
      this.el.remove();
    }
  }

  new Pin({ lat: VENUE.lat, lng: VENUE.lng }, "venue", tagText("venue")).setMap(map);

  // Legend (bottom left) and zoom buttons (bottom right), as on the other views
  const legend = document.createElement("div");
  legend.className = "map-legend";
  legend.innerHTML = `
    <span><i class="swatch lime"></i>Your route</span>
    <span><i class="swatch cyan"></i>On your way</span>
    <span><i class="swatch grey"></i>Elsewhere</span>
    <span class="legend-vehicles">${vehicleIcon("car", 16)}Car ${vehicleIcon("bike", 16)}Bike</span>`;
  const zoom = document.createElement("div");
  zoom.className = "map-zoom";
  for (const [label, text, delta] of [["Zoom in", "+", 1], ["Zoom out", "−", -1]] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => map.setZoom((map.getZoom() ?? 11) + delta));
    zoom.append(b);
  }
  // in the wrapper around the map, so they sit exactly where they do on the other views and hide with it
  container.parentElement?.append(legend, zoom);

  const updateLabels = () => container.classList.toggle("show-labels", (map.getZoom() ?? 0) >= LABEL_ZOOM);
  map.addListener("zoom_changed", updateLabels);
  updateLabels();

  const pins = new globalThis.Map<number, { key: string; pin: Pin }>();
  let routeLines: google.maps.Polyline[] = [];
  let previewLines: google.maps.Polyline[] = [];
  let signature = "";

  /** A route line with a dark outline, which keeps lime and cyan readable on Google's light map. */
  function makeLine(path: LatLng[], color: string, weight: number, opacity = 1) {
    return [
      new google.maps.Polyline({ path, map, strokeColor: "#08090e", strokeOpacity: 0.9, strokeWeight: weight + 4, zIndex: 2 }),
      new google.maps.Polyline({ path, map, strokeColor: color, strokeOpacity: opacity, strokeWeight: weight, zIndex: 3 }),
    ];
  }

  function focusPath(path: LatLng[]): void {
    if (path.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const p of path) bounds.extend(p);
    map.fitBounds(bounds, { top: 64, bottom: 56, left: 56, right: 110 });
  }

  return {
    renderAttendees(attendees: Attendee[], who: Relations) {
      const seen = new Set<number>();
      for (const a of attendees) {
        seen.add(a.id);
        const kind: PinKind = a.id === who.meId ? "me" : who.matchIds.has(a.id) ? "match" : "other";
        const key = `${markerKey(a)}|${kind}`;
        const existing = pins.get(a.id);
        if (existing?.key === key) continue;
        existing?.pin.setMap(null);
        const pin = new Pin({ lat: a.lat, lng: a.lng }, kind, tagText(kind, a), a.role === "giver" ? a.vehicle : null);
        pin.setMap(map);
        pins.set(a.id, { key, pin });
      }
      for (const [id, entry] of pins) {
        if (seen.has(id)) continue;
        entry.pin.setMap(null);
        pins.delete(id);
      }
    },

    renderRoutes(mine: Attendee | null, matches: Attendee[]) {
      const drawn = matches.slice(0, MAX_DRAWN_ROUTES);
      const next = routesSignature(mine, drawn);
      if (next === signature) return;
      signature = next;
      for (const l of routeLines) l.setMap(null);
      routeLines = [];
      if (!mine) return;
      for (const m of drawn) {
        if (m.route_polyline) routeLines.push(...makeLine(decodePolyline(m.route_polyline), COLORS.match, 4, 0.85));
      }
      if (mine.route_polyline) routeLines.push(...makeLine(decodePolyline(mine.route_polyline), COLORS.mine, 5));
    },

    showPreview(polyline: string | null) {
      for (const l of previewLines) l.setMap(null);
      previewLines = [];
      if (!polyline) return;
      const path = decodePolyline(polyline);
      previewLines = makeLine(path, COLORS.preview, 4);
      focusPath(path);
    },

    focusPath,
  };
}
