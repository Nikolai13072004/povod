CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  interests TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  location TEXT NOT NULL DEFAULT '',
  category TEXT,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  image_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);

CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at);
CREATE INDEX IF NOT EXISTS events_author_id_idx ON events (author_id);
CREATE INDEX IF NOT EXISTS events_category_idx ON events (category);

CREATE TABLE IF NOT EXISTS event_participants (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_participants_user_id_idx
  ON event_participants (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  text TEXT NOT NULL CHECK (length(btrim(text)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_event_id_created_at_idx
  ON comments (event_id, created_at);

CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id < friend_id)
);

CREATE INDEX IF NOT EXISTS friendships_friend_id_idx ON friendships (friend_id);
