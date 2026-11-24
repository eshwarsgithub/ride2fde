# ride2fde — Project Log

Status snapshot of what is implemented, what is planned, and what has been executed.
Written from the code in the repo; items marked **(unverified)** could not be confirmed from the repo alone.

## Goal

A small webapp for FDE Summit attendees to coordinate getting to **IIT Hyderabad (Kandi Campus)**:
share your starting location, see who is coming from your side of the city, and pool a ride.

## Stack

| Layer     | Choice                                                         |
|-----------|----------------------------------------------------------------|
| Frontend  | Vanilla TypeScript + Vite (`src/`, `index.html`)               |
| Map       | Google Maps Platform 3D (`Map3DElement`, `Marker3DElement`)    |
| Places / distance | Google Places + Distance Matrix (`routes` library)     |
| Backend   | Cloudflare Pages Functions (`functions/api/attendees.ts`)      |
| Database  | Cloudflare D1 (SQLite), schema in `migrations/0001_init.sql`   |
| Shared    | `shared/types.ts`, `shared/zones.ts` (used by both sides)      |

## Implemented

### Data model (`migrations/0001_init.sql`)
`attendees` table: `id, name, phone, address, lat, lng, zone, mode, pooling, distance_km, eta_min, created_at`,
with an index on `zone`. Transport modes: car, bike, auto, cab, public_transport, walking.

### Zones (`shared/zones.ts`)
- Venue constant (IITH, 17.5947, 78.1265).
- 7 hand-picked commute zones along the NH65 / ORR corridors (Gachibowli, Kondapur/Hitech City,
  Kukatpally, Patancheru, Secunderabad, Banjara Hills, Dilsukhnagar) plus an `other` bucket.
- Each zone has a centroid and a list of neighbouring zones.
- `haversineKm` and `nearestZone` (nearest-centroid assignment, never returns `other`).

### API (`functions/api/attendees.ts`)
- `GET /api/attendees` — all attendees ordered by zone, then distance.
- `POST /api/attendees` — validates name, address, lat/lng, mode; strips phone to digits; assigns the
  zone server-side via `nearestZone`; returns the inserted row (201). Invalid input returns 400.

### Frontend (`src/`)
- `main.ts` — bootstraps map, form and panel.
- `map.ts` — 3D map centred on the venue, venue marker, attendee markers (re-rendered on refresh).
- `form.ts` — dialog to submit location (Places autocomplete bounded to Hyderabad, or "use my location"),
  name, optional phone, mode, pooling opt-in.
- `distance.ts` — driving distance and ETA to the venue via Distance Matrix (single estimate at submit time).
- `panel.ts` — side panel grouping attendees by zone, showing the viewer's zone and its neighbours first;
  cards show mode, distance, ETA, address and a WhatsApp (`wa.me`) link when a phone is given.
  Output is HTML-escaped.
- `api.ts` — fetch wrappers for the endpoints above.
- `style.css` — styling.

### Tooling
- `npm run dev` (Vite, proxies `/api` to wrangler), `npm run pages:dev`, `npm run build`,
  `npm run db:migrate:local|remote`, `npm run deploy`.
- `npx tsc --noEmit` passes with no errors.

## Executed

- Project scaffolded and the code above written (single initial commit of everything; no earlier git history).
- Typecheck run clean. A `dist/` build output exists locally (git-ignored).
- **(unverified)** Google Maps API key, D1 database creation, remote migration and Pages deploy —
  `wrangler.toml` still has the placeholder `database_id = "REPLACE_WITH_D1_DATABASE_ID"`, so the D1 database
  has not been wired in yet.

## Planned / not done yet

1. Create the Google Cloud project, enable billing and the Maps JavaScript + Places APIs, restrict the key by
   HTTP referrer, put it in `.env` as `VITE_GOOGLE_MAPS_API_KEY`.
2. `npx wrangler d1 create ride2fde-db`; paste the real `database_id` into `wrangler.toml`.
3. Apply migrations locally and remotely.
4. Run locally end-to-end (`pages:dev` + `dev`) and sanity check the form, map markers and panel.
5. `npm run deploy` to Cloudflare Pages.
6. Possible follow-ups: shared passcode on the Function, edit/delete of an entry, live ETA refresh,
   pooling match suggestions beyond zone grouping.

## Known trade-offs (by design, one-day event)

- No auth: anyone with the link can see names and phone numbers. Share only in a closed group chat.
  A static shared passcode can be added to the Function without changing the data model.
- ETA is a single driving estimate at submission time, not live traffic.
- Zones are a fixed hand-picked list, not a clustering algorithm.
- No rate limiting or duplicate detection on `POST /api/attendees`.
