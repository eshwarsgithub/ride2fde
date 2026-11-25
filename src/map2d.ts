import { VENUE } from "../shared/zones";
import { decodePolyline, type LatLng } from "../shared/geo";
import { COLORS, MAX_DRAWN_ROUTES, markerKey, routesSignature, type MapView, type Relations } from "./map-view";
import type { Attendee, Vehicle } from "../shared/types";
import { vehicleIcon } from "./icons";

/**
 * The dark map, built from the "ride2fde UI Redesign" canvas:
 *   land #0A0C12 · water #0C1A22 · parks #0D1710 · roads #1D212D · boundaries #2C3242
 * A style array works on any Google key, so there is no Cloud map ID to set up.
 * Icons, POIs, transit and road labels are hidden so the routes stay the focus.
 */
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0a0c12" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5d6578" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0c12" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2c3242" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0a0c12" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#0d1710" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1d212d" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c1a22" }] },
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
];

/** Names of people who are neither you nor on your way appear only when zoomed in this far. */
const LABEL_ZOOM = 13;

type PinKind = "me" | "match" | "other" | "venue";

/** The text on a pin's tag: first names in capitals, like the design. */
function tagText(kind: PinKind, a?: Attendee): string {
  if (kind === "me") return "YOU";
  if (kind === "venue") return "IIT HYDERABAD · KANDI";
  return (a?.name ?? "").split(" ")[0].toUpperCase();
}

export type MapTheme = "standard" | "dark";

/** A 2D map that can switch between Google's standard look and the dark look without being rebuilt. */
export interface Map2DView extends MapView {
  setTheme(theme: MapTheme): void;
}

const STANDARD_BACKGROUND = "#e5e3df"; // Google's own land colour, shown while tiles load

export async function createMap2D(container: HTMLElement): Promise<Map2DView> {
  const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;

  const map = new Map(container, {
    center: { lat: VENUE.lat, lng: VENUE.lng },
    zoom: 11,
    // no `styles`: the standard look is Google's own, untouched
    backgroundColor: STANDARD_BACKGROUND,
    disableDefaultUI: true, // Google's white buttons clash with the dark theme: we add our own below
    clickableIcons: false,
    // Phones: one finger scrolls the page and two fingers move the map, so the map never traps scrolling.
    // Desktop keeps plain wheel-zoom and drag.
    gestureHandling: window.matchMedia("(pointer: coarse)").matches ? "cooperative" : "greedy",
    // Keep to a sensible range: zooming out to the whole country or in past the imagery just loads blank tiles.
    minZoom: 8,
    maxZoom: 17,
  });

  /** A DOM marker. Unlike the old Marker class it isn't deprecated, and it needs no map ID. */
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
      this.getPanes()?.overlayMouseTarget.appendChild(this.el); // above the route lines, so tags are never struck through
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

  // ── Legend (bottom left) and zoom buttons (bottom right), as in the design ──
  const legend = document.createElement("div");
  legend.className = "map-legend";
  legend.innerHTML = `
    <span><i class="swatch lime"></i>Your route</span>
    <span><i class="swatch cyan"></i>On your way</span>
    <span><i class="swatch grey"></i>Elsewhere</span>
    <span class="legend-vehicles">${vehicleIcon("car", 16)}Car ${vehicleIcon("bike", 16)}Bike</span>`;
  map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(legend);

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
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(zoom);

  const updateLabels = () => container.classList.toggle("show-labels", (map.getZoom() ?? 0) >= LABEL_ZOOM);
  map.addListener("zoom_changed", updateLabels);
  updateLabels();

  const pins = new globalThis.Map<number, { key: string; pin: Pin }>();
  let routeLines: google.maps.Polyline[] = [];
  let signature = "";
  let previewLines: google.maps.Polyline[] = [];

  let theme: MapTheme = "standard";

  /**
   * A route line. On the dark map it gets a soft glow; on Google's light map a glow would vanish,
   * so it gets a dark outline instead, which keeps lime and cyan readable.
   */
  function makeLine(path: LatLng[], color: string, weight: number, opts: { glow?: boolean; opacity?: number } = {}) {
    const lines: google.maps.Polyline[] = [];
    if (theme === "dark" && opts.glow) {
      lines.push(new google.maps.Polyline({ path, map, strokeColor: color, strokeOpacity: 0.16, strokeWeight: weight + 14, zIndex: 1 }));
      lines.push(new google.maps.Polyline({ path, map, strokeColor: color, strokeOpacity: 0.3, strokeWeight: weight + 7, zIndex: 2 }));
    }
    if (theme === "standard") {
      lines.push(new google.maps.Polyline({ path, map, strokeColor: "#08090e", strokeOpacity: 0.9, strokeWeight: weight + 4, zIndex: 2 }));
    }
    lines.push(new google.maps.Polyline({ path, map, strokeColor: color, strokeOpacity: opts.opacity ?? 1, strokeWeight: weight, zIndex: 3 }));
    return lines;
  }

  function focusPath(path: LatLng[]): void {
    if (path.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const p of path) bounds.extend(p);
    map.fitBounds(bounds, 56);
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
        if (m.route_polyline) routeLines.push(...makeLine(decodePolyline(m.route_polyline), COLORS.match, 4, { opacity: 0.85 }));
      }
      if (mine.route_polyline) routeLines.push(...makeLine(decodePolyline(mine.route_polyline), COLORS.mine, 5, { glow: true }));
    },

    showPreview(polyline: string | null) {
      for (const l of previewLines) l.setMap(null);
      previewLines = [];
      if (!polyline) return;
      const path = decodePolyline(polyline);
      previewLines = makeLine(path, COLORS.preview, 4, { glow: true });
      focusPath(path);
    },

    focusPath,

    setTheme(next: MapTheme) {
      if (next === theme) return;
      theme = next;
      map.setOptions({
        styles: next === "dark" ? DARK_STYLE : [],
        backgroundColor: next === "dark" ? "#0a0c12" : STANDARD_BACKGROUND,
      });
      container.classList.toggle("dark", next === "dark");
      signature = ""; // redraw the routes with the other look on the next refresh
    },
  };
}
