CREATE TABLE IF NOT EXISTS attendees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,                 -- optional, digits only, used to build a wa.me link
  address TEXT NOT NULL,      -- formatted address / typed locality
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  zone TEXT NOT NULL,         -- assigned server-side, nearest zone centroid
  mode TEXT NOT NULL,         -- car | bike | auto | cab | public_transport | walking
  pooling INTEGER NOT NULL DEFAULT 1, -- 1 = open to pooling, 0 = just sharing location
  distance_km REAL,
  eta_min REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attendees_zone ON attendees(zone);
