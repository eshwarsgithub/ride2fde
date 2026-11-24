import { initMap, renderAttendeeMarkers } from "./map";
import { fetchAttendees } from "./api";
import { renderZonePanel } from "./panel";
import { setupAttendeeForm } from "./form";

const POLL_MS = 15_000;

async function refresh(mapEl: Awaited<ReturnType<typeof initMap>>) {
  try {
    const attendees = await fetchAttendees();
    renderZonePanel(attendees);
    renderAttendeeMarkers(mapEl, attendees);
  } catch (err) {
    console.error("Failed to refresh attendees", err);
  }
}

async function main() {
  const mapEl = await initMap();

  setupAttendeeForm(() => {
    void refresh(mapEl);
  });

  await refresh(mapEl);
  setInterval(() => void refresh(mapEl), POLL_MS);
}

main().catch((err) => {
  console.error(err);
  const panel = document.getElementById("zone-panel");
  if (panel) panel.innerHTML = `<p class="panel-empty">Failed to load the map. Check the console for details.</p>`;
});
