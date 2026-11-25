import { ZONES, VENUE, zoneById } from "../shared/zones";
import type { Match, MatchMode } from "./match";
import type { Attendee, Role } from "../shared/types";

export interface PanelOptions {
  mode: MatchMode;
  showAll: boolean;
}

/** How many matches to list before "Show more". */
export const LIST_LIMIT = 12;

const ROLE_LABEL: Record<Role, string> = {
  giver: "Ride giver",
  taker: "Ride taker",
};

/** Zones the viewer has opened/closed by hand, so a refresh doesn't snap them shut. */
const zoneOpen = new Map<string, boolean>();
let lastHtml = "";

export function rememberZoneToggle(zoneId: string, open: boolean): void {
  zoneOpen.set(zoneId, open);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function whatsapp(a: Attendee): string {
  return a.phone
    ? `<a class="wa" href="https://wa.me/${encodeURIComponent(a.phone)}" target="_blank" rel="noopener" aria-label="Message ${esc(a.name)} on WhatsApp">WhatsApp</a>`
    : "";
}

function pill(role: Role): string {
  return `<span class="pill ${role}">${ROLE_LABEL[role]}</span>`;
}

function journey(a: Attendee): string {
  const bits: string[] = [];
  if (a.distance_km != null) bits.push(`${a.distance_km} km to IITH`);
  if (a.eta_min != null) bits.push(`~${a.eta_min} min`);
  return bits.join(", ");
}

function matchNote(me: Attendee, m: Match): string {
  const off = m.gapKm < 0.3 ? "on your route" : `${m.gapKm.toFixed(1)} km off your route`;
  if (me.role === "giver" && m.alongKm != null) {
    return `Pick up about ${Math.max(1, Math.round(m.alongKm))} km in, ${off}`;
  }
  return me.role === "giver" ? off : `Drives past you, ${off}`;
}

function stop(kind: string, body: string): string {
  return `<li class="stop ${kind}"><span class="dot" aria-hidden="true"></span><div class="body">${body}</div></li>`;
}

function personStop(me: Attendee, m: Match): string {
  const a = m.attendee;
  return stop(
    "match",
    `<div class="who"><strong>${esc(a.name)}</strong>${pill(a.role)}</div>
     <small class="note">${esc(matchNote(me, m))}</small>
     <small>${esc(a.address)}</small>
     ${whatsapp(a)}`
  );
}

/** Zone ids in priority order: the viewer's own zone, then its neighbours, then everyone else. */
function priorityOrder(myZone: string | null): string[] {
  const allIds = ZONES.map((z) => z.id);
  if (!myZone) return allIds;
  const neighbours = zoneById(myZone)?.neighbors ?? [];
  return [myZone, ...neighbours, ...allIds.filter((id) => id !== myZone && !neighbours.includes(id))];
}

function renderRouteSection(me: Attendee, matches: Match[], opts: PanelOptions): string {
  const shown = opts.showAll ? matches : matches.slice(0, LIST_LIMIT);
  const hidden = matches.length - shown.length;
  const driver = me.role === "giver";

  const modeSwitch = `
    <div class="seg" role="group" aria-label="Who to show">
      <button type="button" data-mode="best" aria-pressed="${opts.mode === "best"}">${driver ? "Riders" : "Drivers"}</button>
      <button type="button" data-mode="all" aria-pressed="${opts.mode === "all"}">Everyone</button>
    </div>`;

  const summary =
    matches.length === 0
      ? `<p class="empty">${
          opts.mode === "best"
            ? driver
              ? "No riders on your route yet. New people appear here automatically."
              : "No drivers on your route yet. New people appear here automatically."
            : "No one is on your route yet. New people appear here automatically."
        }</p>`
      : "";

  const more =
    hidden > 0
      ? `<li class="stop more"><span class="dot" aria-hidden="true"></span><div class="body"><button type="button" class="link" data-more="1">Show ${hidden} more</button></div></li>`
      : opts.showAll && matches.length > LIST_LIMIT
        ? `<li class="stop more"><span class="dot" aria-hidden="true"></span><div class="body"><button type="button" class="link" data-more="0">Show fewer</button></div></li>`
        : "";

  return `
    <section class="route" aria-label="Your route">
      <div class="route-head">
        <h2>${matches.length === 0 ? "Your route" : `${matches.length} on your way`}</h2>
        ${modeSwitch}
      </div>
      ${summary}
      <ol class="line">
        ${stop(
          "me",
          `<div class="who"><strong>You</strong>${pill(me.role)}</div>
           <small>${esc(me.address)}</small>
           <small>${esc(journey(me))}</small>`
        )}
        ${shown.map((m) => personStop(me, m)).join("")}
        ${more}
        ${stop("end", `<div class="who"><strong>${esc(VENUE.name)}</strong></div>`)}
      </ol>
    </section>`;
}

function renderZones(others: Attendee[], myZone: string | null, title: string): string {
  if (others.length === 0) return "";
  const neighbours = myZone ? zoneById(myZone)?.neighbors ?? [] : [];

  const byZone = new Map<string, Attendee[]>();
  for (const a of others) {
    if (!byZone.has(a.zone)) byZone.set(a.zone, []);
    byZone.get(a.zone)!.push(a);
  }

  const groups = priorityOrder(myZone)
    .filter((id) => byZone.has(id))
    .map((id) => {
      const group = byZone.get(id)!;
      const near = id === myZone || neighbours.includes(id);
      const open = zoneOpen.get(id) ?? near;
      return `
        <details class="zone ${near ? "near" : ""}" data-zone="${id}" ${open ? "open" : ""}>
          <summary><span>${esc(zoneById(id)?.name ?? id)}</span><b>${group.length}</b></summary>
          <ul class="people">
            ${group
              .map(
                (a) => `<li>
                  <div class="who"><strong>${esc(a.name)}</strong>${pill(a.role)}</div>
                  <small>${esc(a.address)}</small>
                  ${whatsapp(a)}
                </li>`
              )
              .join("")}
          </ul>
        </details>`;
    })
    .join("");

  return `<section class="others"><h2>${title}</h2>${groups}</section>`;
}

function updateStats(attendees: Attendee[]): void {
  const givers = attendees.filter((a) => a.role === "giver").length;
  const takers = attendees.length - givers;
  const el = document.getElementById("stats");
  if (!el) return;
  el.hidden = attendees.length === 0;
  el.innerHTML = `<span><b>${givers}</b> giving rides</span><span><b>${takers}</b> need a ride</span>`;
}

export function renderPanel(attendees: Attendee[], me: Attendee | null, matches: Match[], opts: PanelOptions): void {
  const panel = document.getElementById("zone-panel")!;
  updateStats(attendees);

  let html: string;
  if (attendees.length === 0) {
    html = `
      <div class="welcome">
        <h2>Be the first on the road</h2>
        <p>Add where you're starting from. We'll draw your route to IIT Hyderabad and show anyone heading the same way.</p>
        <button type="button" class="cta" data-open-form="1">Add my route</button>
      </div>`;
  } else {
    html = me
      ? renderRouteSection(me, matches, opts)
      : `<div class="welcome compact">
           <h2>Who's on your way?</h2>
           <p>Add your start point to see drivers and riders along your route.</p>
           <button type="button" class="cta" data-open-form="1">Add my route</button>
         </div>`;

    const taken = new Set<number>([me?.id ?? -1, ...matches.map((m) => m.attendee.id)]);
    const others = attendees.filter((a) => !taken.has(a.id));
    html += renderZones(others, me?.zone ?? null, me ? "Everyone else" : "Everyone heading to IITH");
  }

  if (html === lastHtml) return; // nothing changed since the last poll; leave the DOM (and scroll) alone
  lastHtml = html;
  panel.innerHTML = html;
}
