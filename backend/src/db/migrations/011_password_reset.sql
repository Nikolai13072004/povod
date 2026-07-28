-- Восстановление пароля (SEC-008).
--
-- Хранится только SHA-256 токена, как у сессий и приглашений: по украденной
-- базе нельзя сменить чужой пароль.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  -- Одноразовость обеспечивается отметкой, а не удалением строки: так видно,
  -- что ссылкой уже воспользовались, и повторный переход можно отличить от
  -- выдуманного токена.
  used_at TIMESTAMPTZ
);

-- Просроченные и использованные токены чистятся тем же периодическим заданием,
-- что и сессии (SEC-007), — под это нужен индекс.
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx
  ON password_reset_tokens (expires_at);
