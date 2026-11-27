-- Edit codes are short (like shi4829), so guessing is limited: 5 wrong codes lock an entry's editing for 15 minutes.
ALTER TABLE attendees ADD COLUMN edit_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendees ADD COLUMN edit_locked_until TEXT;
