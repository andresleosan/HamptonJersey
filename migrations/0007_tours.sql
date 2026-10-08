-- 3D tours shown next to the booking form on the home page, managed from the panel's "3D tours" section.
CREATE TABLE tours (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  url TEXT NOT NULL CHECK (url LIKE 'https://%'),
  caption TEXT,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- The Matterport sample space the first demo used: shows visitors what a Hampton 3D tour looks like.
INSERT INTO tours (title, url, caption, position, created_at, updated_at) VALUES
  ('Sample 3D tour', 'https://my.matterport.com/show/?m=JGPnGQ6hosj&play=1&qs=1&brand=0',
   'A Matterport walkthrough like the ones we can film for your home. Drag to look around.', 1,
   '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z');
