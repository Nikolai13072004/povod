-- Лимит участников (BE-007) и время окончания (BE-006).
--
-- Обе колонки допускают NULL и означают «ограничения нет»: у уже созданных
-- событий лимита и времени окончания не было, и придумывать их за автора нельзя.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS participant_limit INTEGER,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- Лимит меньше единицы бессмысленен: автор сам становится первым участником,
-- поэтому событие с лимитом 0 нельзя было бы создать даже его создателю.
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_participant_limit_positive;
ALTER TABLE events
  ADD CONSTRAINT events_participant_limit_positive
  CHECK (participant_limit IS NULL OR participant_limit >= 1);

-- Событие, которое заканчивается раньше, чем начинается, — это опечатка, а не
-- данные. Ловим её в схеме, а не только в валидации запроса: в базу пишет не
-- только HTTP-слой (сиды, импорт legacy-снимка, будущие интеграции).
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_ends_after_starts;
ALTER TABLE events
  ADD CONSTRAINT events_ends_after_starts
  CHECK (ends_at IS NULL OR ends_at > starts_at);

-- Приглашения в закрытые события (BE-008).
--
-- Хранится только SHA-256 приглашения — как у сессий: утёкшая база не даёт
-- войти в чужое закрытое событие.
CREATE TABLE IF NOT EXISTS event_invitations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  -- NULL — без ограничения по числу переходов.
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses >= 1),
  used_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ
);

-- Проверка приглашения идёт по хэшу и выполняется на каждом открытии закрытого
-- события по ссылке, поэтому индекс здесь важнее, чем список приглашений автора.
CREATE INDEX IF NOT EXISTS event_invitations_event_idx
  ON event_invitations (event_id, created_at DESC);
