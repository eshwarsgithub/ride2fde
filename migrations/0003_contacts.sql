-- Contact methods (LinkedIn, WhatsApp, phone) replace the single phone number.
-- Stored as a small JSON list of { type, value }.
ALTER TABLE attendees ADD COLUMN contacts TEXT NOT NULL DEFAULT '[]';

-- keep any phone numbers already collected, as WhatsApp contacts
UPDATE attendees
   SET contacts = json_array(json_object('type', 'whatsapp', 'value', phone))
 WHERE phone IS NOT NULL AND phone != '';

ALTER TABLE attendees DROP COLUMN phone;
