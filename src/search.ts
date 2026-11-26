/**
 * Address search and "use my location", on Photon: a free, open geocoder built on OpenStreetMap data,
 * made for search-as-you-type. No key. Its public server is fair-use, so typing is debounced and
 * only the latest request is kept.
 */
const PHOTON_URL = "https://photon.komoot.io";

/** Greater Hyderabad, so a search for "Ameerpet" doesn't wander to another state. minLon,minLat,maxLon,maxLat */
const HYDERABAD_BBOX = "78.0,17.1,78.75,17.75";
const BIAS = { lat: 17.44, lon: 78.4 };

export interface Place {
  lat: number;
  lng: number;
  /** What the person sees in the box, e.g. "Miyapur Metro Station, Miyapur". */
  label: string;
  /** A rough area name, like "Miyapur". This is all the server stores. */
  area: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    type?: string;
    street?: string;
    housenumber?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
  };
}

/** OSM names some Hyderabad districts "Ward 108 Miyapur"; people say "Miyapur". */
const clean = (s?: string) => (s ?? "").replace(/^Ward\s+\d+\s+/i, "").trim();

/** The neighbourhood-level name for a place, so we never store a street address. */
function areaOf(p: PhotonFeature["properties"]): string {
  if (p.locality) return clean(p.locality);
  if (p.type && ["locality", "district", "city"].includes(p.type) && p.name) return clean(p.name);
  return clean(p.district) || clean(p.city) || clean(p.county);
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const area = areaOf(p);
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [p.name, street, area, clean(p.city)].filter((x, i, all) => x && all.indexOf(x) === i);
  return { lat, lng, label: parts.join(", ") || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, area };
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: "6", lang: "en", bbox: HYDERABAD_BBOX, lat: String(BIAS.lat), lon: String(BIAS.lon) });
  const res = await fetch(`${PHOTON_URL}/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`Search answered ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  // OSM often has a station, a stop and a road all called "Miyapur": show each label once.
  const seen = new Set<string>();
  return (data.features ?? []).map(toPlace).filter((p) => !seen.has(p.label) && seen.add(p.label));
}

export async function reverseGeocode(lat: number, lng: number): Promise<Place | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: "en" });
  const res = await fetch(`${PHOTON_URL}/reverse?${params}`, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Reverse lookup answered ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const f = data.features?.[0];
  if (!f) return null;
  // The nearest OSM object is often a shop or hospital; describe the neighbourhood instead.
  const area = areaOf(f.properties);
  const wider = [clean(f.properties.district), clean(f.properties.city)].find((x) => x && x !== area);
  const label = [area, wider].filter(Boolean).join(", ");
  return { lat, lng, area, label: label ? `Near ${label}` : `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
}

/**
 * Turns a text input into an accessible combobox with a suggestion list underneath.
 * Arrow keys move through the list, Enter picks, Escape closes.
 */
export function attachPlaceSearch(input: HTMLInputElement, list: HTMLUListElement, onPick: (place: Place) => void): void {
  let results: Place[] = [];
  let activeIndex = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: AbortController | undefined;

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");
  list.setAttribute("role", "listbox");

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  };

  const highlight = (i: number) => {
    activeIndex = i;
    [...list.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    if (i >= 0) input.setAttribute("aria-activedescendant", `${list.id}-${i}`);
    else input.removeAttribute("aria-activedescendant");
  };

  const pick = (i: number) => {
    const place = results[i];
    if (!place) return;
    close();
    onPick(place);
  };

  const render = (message?: string) => {
    list.replaceChildren();
    if (message) {
      const li = document.createElement("li");
      li.className = "suggestion-note";
      li.textContent = message;
      list.append(li);
    }
    results.forEach((place, i) => {
      const li = document.createElement("li");
      li.id = `${list.id}-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.textContent = place.label; // text, never markup
      // mousedown, not click: it fires before the input loses focus
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(i);
      });
      list.append(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    inflight?.abort();
    const query = input.value.trim();
    if (query.length < 3) {
      results = [];
      close();
      return;
    }
    timer = setTimeout(async () => {
      inflight = new AbortController();
      try {
        results = await searchPlaces(query, inflight.signal);
        render(results.length ? undefined : "No matches in Hyderabad. Try a nearby area or landmark.");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        results = [];
        render("Search isn't responding. Try “Use my current location”.");
      }
    }, 300);
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight((activeIndex + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight((activeIndex - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault(); // don't submit the form while choosing
      pick(activeIndex >= 0 ? activeIndex : 0);
    } else if (e.key === "Escape") {
      e.preventDefault(); // close the list, not the dialog
      e.stopPropagation();
      close();
    }
  });

  input.addEventListener("blur", close);
}
