-- Store each user's preferred page size for paginated views.
ALTER TABLE users ADD COLUMN page_size INTEGER NOT NULL DEFAULT 20 CHECK (page_size IN (5, 10, 20, 50));

