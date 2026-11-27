// Small helpers for the Pages Function. Kept out of /functions so they never become routes.

/** Start points are stored on a ~300 m grid, so nobody's front door is on the map. */
export const GRID_DEG = 0.003;

export function roundToGrid(value: number): number {
  return Number((Math.round(value / GRID_DEG) * GRID_DEG).toFixed(4));
}

/**
 * A fresh edit code like shi4829: the first three letters of the name (random letters fill in for names with fewer
 * Latin letters) and four random digits. Shown to the person once; only its hash is stored.
 */
export function newEditCode(name: string): string {
  const rand = crypto.getRandomValues(new Uint32Array(4));
  let letters = name.normalize("NFD").toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
  for (let i = letters.length; i < 3; i++) letters += String.fromCharCode(97 + (rand[i] % 26));
  return letters + String(rand[3] % 10_000).padStart(4, "0");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two hex strings without stopping at the first difference. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
