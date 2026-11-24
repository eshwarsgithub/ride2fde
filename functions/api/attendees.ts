import { nearestZone } from "../../shared/zones";
import type { Attendee, AttendeeInput, TransportMode } from "../../shared/types";

interface Env {
  DB: D1Database;
}

const MODES: TransportMode[] = ["car", "bike", "auto", "cab", "public_transport", "walking"];

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

  const attendees = (results ?? []).map((r) => ({
    ...r,
    pooling: Boolean(r.pooling),
  }));

  return new Response(JSON.stringify({ attendees }), {
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
  const mode = body.mode;

  if (!name) return badRequest("name is required");
  if (!address) return badRequest("address is required");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return badRequest("lat/lng must be numbers");
  if (!MODES.includes(mode)) return badRequest(`mode must be one of: ${MODES.join(", ")}`);

  const phone = body.phone ? digitsOnly(body.phone) : null;
  const pooling = body.pooling === false ? 0 : 1;
  const distance_km = Number.isFinite(Number(body.distance_km)) ? Number(body.distance_km) : null;
  const eta_min = Number.isFinite(Number(body.eta_min)) ? Number(body.eta_min) : null;

  const zone = nearestZone({ lat, lng }).id;

  const inserted = await env.DB.prepare(
    `INSERT INTO attendees (name, phone, address, lat, lng, zone, mode, pooling, distance_km, eta_min)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(name, phone, address, lat, lng, zone, mode, pooling, distance_km, eta_min)
    .first<Attendee>();

  return new Response(JSON.stringify({ attendee: { ...inserted, pooling: Boolean(inserted?.pooling) } }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
};
