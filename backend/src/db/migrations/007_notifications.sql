CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('event_updated', 'event_cancelled', 'event_comment', 'event_joined')
  ),
  -- SET NULL, а не CASCADE: уведомление обязано пережить удаление события, о
  -- котором оно сообщает, иначе история очистится ровно там, где интереснее
  -- всего. Само уведомление об отмене ссылку и не заводит: открывать нечего.
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  -- Название и имя дублируются сюда по той же причине: после удаления события
  -- или пользователя прочитать их будет уже негде.
  event_title TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  changes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- Основной запрос: лента уведомлений одного пользователя, свежие сверху.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

-- Счётчик на колокольчике запрашивается на каждой странице; частичный индекс
-- держит в себе только непрочитанные, поэтому не растёт вместе с историей.
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id)
  WHERE read_at IS NULL;
