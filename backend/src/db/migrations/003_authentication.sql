CREATE TABLE IF NOT EXISTS password_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_identities (
  provider TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, external_user_id),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS external_identities_user_id_idx
  ON external_identities (user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

INSERT INTO external_identities (provider, external_user_id, user_id)
SELECT 'vk', substring(id FROM 4), id
FROM users
WHERE id LIKE 'vk\_%' ESCAPE '\'
ON CONFLICT DO NOTHING;
