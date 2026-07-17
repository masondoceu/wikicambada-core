PRAGMA foreign_keys = ON;

ALTER TABLE revisions ADD COLUMN title TEXT;
ALTER TABLE revisions ADD COLUMN subtitle TEXT;
ALTER TABLE revisions ADD COLUMN categories_json TEXT;
