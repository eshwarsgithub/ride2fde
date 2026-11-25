-- What a ride giver travels in: 'car' or 'bike'. NULL for ride takers and for entries made before this existed.
ALTER TABLE attendees ADD COLUMN vehicle TEXT;
