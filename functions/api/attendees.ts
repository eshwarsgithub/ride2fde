import { nearestZone } from "../../shared/zones";
import { ROUTE_TOLERANCE_KM, decodePolyline, encodePolyline, simplifyPath, straightLineRoute } from "../../shared/geo";
import type { Attendee, AttendeeInput, Role } from "../../shared/types";

interface Env {
  DB: D1Database;
}

const ROLES: Role[] = ["giver", "taker"];
const MAX_POLYLINE_LEN = 30_000;

function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, "");
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    "SELECT * FROM attendees ORDER BY zone ASC, distance_km ASC"
  ).all<Attendee>();

  return new Response(JSON.stringify({ attendees: results ?? [] }), {
    headers: { "content-type": "application/json" },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: AttendeeInput;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const role = body.role;

  if (!name || name.length > 80) return badRequest("name is required (max 80 characters)");
  if (!address || address.length > 300) return badRequest("address is required (max 300 characters)");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return badRequest("lat/lng must be valid coordinates");
  }
  if (!ROLES.includes(role)) return badRequest(`role must be one of: ${ROLES.join(", ")}`);

  const phone = body.phone ? digitsOnly(String(body.phone)).slice(0, 15) : null;
  const distance_km = Number.isFinite(Number(body.distance_km)) ? Number(body.distance_km) : null;
  const eta_min = Number.isFinite(Number(body.eta_min)) ? Number(body.eta_min) : null;

  // Accept the client's route only if it decodes to a sane path; otherwise fall back to a straight line.
  let route_polyline = typeof body.route_polyline === "string" ? body.route_polyline : "";
  const decoded = route_polyline && route_polyline.length <= MAX_POLYLINE_LEN ? decodePolyline(route_polyline) : [];
  if (decoded.length < 2 || decoded.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) {
    route_polyline = straightLineRoute({ lat, lng });
  } else {
    // Store a slim route: it keeps the shape but is ~95% smaller to send and faster to match.
    route_polyline = encodePolyline(simplifyPath(decoded, ROUTE_TOLERANCE_KM));
  }

  const zone = nearestZone({ lat, lng }).id;

  const inserted = await env.DB.prepare(
    `INSERT INTO attendees (name, phone, role, address, lat, lng, zone, route_polyline, distance_km, eta_min)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(name, phone, role, address, lat, lng, zone, route_polyline, distance_km, eta_min)
    .first<Attendee>();

  return new Response(JSON.stringify({ attendee: inserted }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
};
