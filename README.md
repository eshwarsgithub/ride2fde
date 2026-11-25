# ride2fde

A small webapp for FDE Summit attendees to coordinate getting to **IIT Hyderabad**: drop your
starting location, see who else is coming from your side of the city, and pool a ride.

- Map: Google Maps Platform 3D (`Map3DElement`), centered on the IITH venue.
- Roles & routes: each person picks **Ride giver** or **Ride taker** and drops a start point. Their driving
  route to IITH (Google Routes API) is drawn on the map and stored; anyone whose start is within ~2 km of
  another person's route shows up under "On your way". By default givers see riders and riders see
  givers; a toggle shows everyone. Stored routes are simplified (~60 m) to keep payloads tiny.
- Zones: attendees are auto-bucketed into ~8 Hyderabad commute zones (nearest-centroid), and the
  side panel prioritizes your zone + its neighbors (Rapido-style, without the hex grid).
- Backend: Cloudflare Pages Functions + D1 (SQLite). No login — just a name.

## One-time setup

1. **Google Maps API key**
   - Create/select a Google Cloud project, enable billing.
   - Enable the **Maps JavaScript API**, **Places API**, **Geocoding API** and **Routes API**
     (the legacy Directions / Distance Matrix APIs are not used).
   - Create an API key, restrict it by HTTP referrer to your dev/prod domains.
   - Copy `.env.example` to `.env` and set `VITE_GOOGLE_MAPS_API_KEY`.

2. **Install dependencies**
   ```
   npm install
   ```

3. **Create the D1 database**
   ```
   npx wrangler d1 create ride2fde-db
   ```
   Copy the returned `database_id` into `wrangler.toml` (replace `REPLACE_WITH_D1_DATABASE_ID`).

4. **Apply the schema**
   ```
   npm run db:migrate:local    # for local dev (re-runnable; applied migrations are tracked)
   npm run db:migrate:remote   # before each deploy that adds a migration
   ```

## Local development

Two dev servers run together: Vite (frontend, hot reload) proxies `/api/*` to `wrangler pages dev`
(Functions + local D1).

```
npm run build        # one-time build so wrangler has something to serve alongside the proxy
npm run pages:dev     # terminal 1: Functions + D1 on :8788
npm run dev           # terminal 2: Vite on :5173, proxies /api -> :8788
```

Open http://localhost:5173.

## Deploy

```
npm run deploy
```

This builds the frontend and deploys the Pages project (static assets + Functions) via Wrangler.
Make sure `VITE_GOOGLE_MAPS_API_KEY` is set in your shell (or a `.env` file) before building, and
that the remote D1 migration has been applied (`npm run db:migrate:remote`).

## Known trade-offs (by design, for a one-day event)

- No auth — anyone with the link can see names/phone numbers submitted. Fine for sharing inside a
  closed group chat; don't post the link publicly. A static shared passcode could be added to the
  Function later without touching the data model.
- ETA is a single driving estimate at submission time (via the Routes API), not live-updating
  traffic. If the Routes API is unavailable the route falls back to a straight line.
- Zones are a fixed, hand-picked list of ~8 localities relevant to an IITH commute — not a precise
  clustering algorithm.
