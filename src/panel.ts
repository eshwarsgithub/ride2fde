import { ZONES, zoneById } from "../shared/zones";
import type { Attendee, TransportMode } from "../shared/types";

const MODE_LABEL: Record<TransportMode, string> = {
  car: "🚗 Car",
  bike: "🏍️ Bike",
  auto: "🛺 Auto",
  cab: "🚕 Cab",
  public_transport: "🚌 Public transport",
  walking: "🚶 Walking",
};

function attendeeCard(a: Attendee): string {
  const meta = [MODE_LABEL[a.mode]];
  if (a.distance_km != null) meta.push(`${a.distance_km} km`);
  if (a.eta_min != null) meta.push(`~${a.eta_min} min`);
  if (!a.pooling) meta.push("not pooling");

  const waLink = a.phone
    ? `<a class="wa-link" href="https://wa.me/${a.phone}" target="_blank" rel="noopener">Chat on WhatsApp</a>`
    : "";

  return `
    <div class="attendee-card">
      <div class="row1"><span>${escapeHtml(a.name)}</span></div>
      <div class="meta">${meta.join(" · ")}</div>
      <div class="meta">${escapeHtml(a.address)}</div>
      ${waLink}
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Zone ids in priority order: the viewer's own zone, then its neighbors, then everyone else. */
function priorityOrder(myZone: string | null): string[] {
  const allIds = ZONES.map((z) => z.id);
  if (!myZone) return allIds;

  const self = zoneById(myZone);
  const neighborIds = self?.neighbors ?? [];
  const rest = allIds.filter((id) => id !== myZone && !neighborIds.includes(id));
  return [myZone, ...neighborIds, ...rest];
}

export function renderZonePanel(attendees: Attendee[]): void {
  const panel = document.getElementById("zone-panel")!;

  if (attendees.length === 0) {
    panel.innerHTML = `<p class="panel-empty">No one's shared their location yet — be the first!</p>`;
    return;
  }

  const myZone = localStorage.getItem("ride2fde:lastZone");
  const order = priorityOrder(myZone);
  const neighborIds = myZone ? zoneById(myZone)?.neighbors ?? [] : [];

  const byZone = new Map<string, Attendee[]>();
  for (const a of attendees) {
    if (!byZone.has(a.zone)) byZone.set(a.zone, []);
    byZone.get(a.zone)!.push(a);
  }

  const html = order
    .filter((id) => byZone.has(id))
    .map((id) => {
      const zone = zoneById(id);
      const group = byZone.get(id)!;
      const isPriority = id === myZone || neighborIds.includes(id);
      return `
        <div class="zone-group ${isPriority ? "priority" : ""}">
          <h3>${zone?.name ?? id} — ${group.length}</h3>
          ${group.map(attendeeCard).join("")}
        </div>
      `;
    })
    .join("");

  panel.innerHTML = html;
}
