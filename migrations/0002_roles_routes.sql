-- Ride giver / ride taker + the route each person drives/travels to the venue.
ALTER TABLE attendees ADD COLUMN role TEXT NOT NULL DEFAULT 'taker';  -- giver | taker
ALTER TABLE attendees ADD COLUMN route_polyline TEXT;                 -- encoded polyline, start -> venue
ALTER TABLE attendees DROP COLUMN mode;
ALTER TABLE attendees DROP COLUMN pooling;
