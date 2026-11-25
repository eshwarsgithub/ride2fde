// Small helpers for the Pages Function. Kept out of /functions so they never become routes.

/** Start points are stored on a ~300 m grid, so nobody's front door is on the map. */
export const GRID_DEG = 0.003;

export function roundToGrid(value: number): number {
  return Number((Math.round(value / GRID_DEG) * GRID_DEG).toFixed(4));
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
