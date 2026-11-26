import { nearestZone, VENUE, haversineKm } from "../../shared/zones";
import { ROUTE_TOLERANCE_KM, decodePolyline, encodePolyline, isStraightLine, simplifyPath, straightLineRoute } from "../../shared/geo";
import { normalizeContacts, type Contact } from "../../shared/contacts";
import { json, roundToGrid } from "../../shared/server";
import { MAX_NAME_LENGTH, MIN_NAME_LENGTH, VEHICLES, type Attendee, type AttendeeInput, type Role, type Vehicle } from "../../shared/types";

interface Env {
  DB: D1Database;
}

const ROLES: Role[] = ["giver", "taker"];
const MAX_POLYLINE_LEN = 30_000;
const COLUMNS = "id, name, role, vehicle, address, lat, lng, zone, route_polyline, distance_km, eta_min, created_at, contacts";

type Row = Omit<Attendee, "contacts"> & { contacts: string };

function toAttendee(row: Row): Attendee {
  let contacts: Contact[] = [];
  try {
    contacts = JSON.parse(row.contacts);
  } catch {
    /* a malformed value just means "no contact shared" */
  }
  return { ...row, contacts };
}

const badRequest = (message: string) => json({ error: message }, 400);

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM attendees ORDER BY zone ASC, distance_km ASC`).all<Row>();
  return json({ attendees: (results ?? []).map(toAttendee) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: AttendeeInput;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const role = body.role;

  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return badRequest(`name must be ${MIN_NAME_LENGTH} to ${MAX_NAME_LENGTH} characters`);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return badRequest("lat/lng must be valid coordinates");
  }
  if (!ROLES.includes(role)) return badRequest(`role must be one of: ${ROLES.join(", ")}`);

  // Ride givers say what they travel in; takers have no vehicle.
  let vehicle: Vehicle | null = null;
  if (role === "giver") {
    if (!VEHICLES.includes(body.vehicle as Vehicle)) return badRequest("vehicle must be car or bike");
    vehicle = body.vehicle as Vehicle;
  }

  const { contacts, error: contactError } = normalizeContacts(body.contacts);
  if (contactError) return badRequest(contactError);

  const distance_km = Number.isFinite(Number(body.distance_km)) ? Number(body.distance_km) : null;
  const eta_min = Number.isFinite(Number(body.eta_min)) ? Number(body.eta_min) : null;

  // The stored start is snapped to a ~300 m grid, and the "address" is only a rough area name.
  const start = { lat: roundToGrid(lat), lng: roundToGrid(lng) };
  const zone = nearestZone(start);
  const sent = typeof body.address === "string" ? body.address.trim().slice(0, 80) : "";
  const area = sent || zone.name;

  // Accept the client's route only if it decodes to a sane path; otherwise fall back to a straight line.
  // The first point is replaced with the snapped start, so the route can't reveal the exact one.
  let route_polyline = typeof body.route_polyline === "string" ? body.route_polyline : "";
  const decoded = route_polyline && route_polyline.length <= MAX_POLYLINE_LEN ? decodePolyline(route_polyline) : [];
  if (decoded.length < 2 || decoded.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) {
    route_polyline = straightLineRoute(start);
  } else {
    decoded[0] = start;
    route_polyline = encodePolyline(simplifyPath(decoded, ROUTE_TOLERANCE_KM));
  }

  const inserted = await env.DB.prepare(
    `INSERT INTO attendees (name, role, vehicle, address, lat, lng, zone, route_polyline, distance_km, eta_min, contacts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`
  )
    .bind(name, role, vehicle, area, start.lat, start.lng, zone.id, route_polyline, distance_km, eta_min, JSON.stringify(contacts))
    .first<Row>();

  return inserted ? json({ attendee: toAttendee(inserted) }, 201) : json({ error: "Could not save" }, 500);
};

/**
 * Upgrades a straight-line route (saved when the routing service was down) to a real road route.
 * Only straight-line routes can be replaced, and the new route must end at the venue and starts from the stored
 * start, so this can't be used to rewrite anyone's real route.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let body: { id?: unknown; route_polyline?: unknown; distance_km?: unknown; eta_min?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("id must be a valid attendee id");

  const row = await env.DB.prepare("SELECT lat, lng, route_polyline FROM attendees WHERE id = ?").bind(id).first<{ lat: number; lng: number; route_polyline: string }>();
  if (!row) return json({ error: "Not found" }, 404);
  if (!isStraightLine(row.route_polyline)) return json({ error: "This route is already a road route" }, 409);

  const sent = typeof body.route_polyline === "string" && body.route_polyline.length <= MAX_POLYLINE_LEN ? body.route_polyline : "";
  const decoded = sent ? decodePolyline(sent) : [];
  const sane = decoded.length >= 3 && decoded.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!sane) return badRequest("route_polyline must be a road route");
  if (haversineKm(decoded[decoded.length - 1], VENUE) > 1) return badRequest("route must end at the venue");

  decoded[0] = { lat: row.lat, lng: row.lng };
  const route_polyline = encodePolyline(simplifyPath(decoded, ROUTE_TOLERANCE_KM));
  const distance_km = Number.isFinite(Number(body.distance_km)) ? Number(body.distance_km) : null;
  const eta_min = Number.isFinite(Number(body.eta_min)) ? Number(body.eta_min) : null;

  await env.DB.prepare("UPDATE attendees SET route_polyline = ?, distance_km = ?, eta_min = ? WHERE id = ?").bind(route_polyline, distance_km, eta_min, id).run();
  return json({ ok: true });
};
