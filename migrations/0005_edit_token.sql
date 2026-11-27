-- SHA-256 hash of the secret edit token handed to the person when they add their route.
-- NULL for entries made before this existed: those can't be edited from the site.
ALTER TABLE attendees ADD COLUMN edit_token_hash TEXT;
