-- Избранное — отдельная таблица связи, а не массив в пользователе: так запись
-- добавляется одним INSERT без гонок за общий массив, а «кто добавил событие
-- в избранное» останется читаемым запросом, если это когда-нибудь понадобится.
CREATE TABLE IF NOT EXISTS event_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Первичный ключ по паре делает добавление идемпотентным на уровне схемы:
  -- повторное нажатие не может создать дубль даже при гонке двух запросов.
  PRIMARY KEY (user_id, event_id)
);

-- Раздел «Избранное» показывает события одного пользователя, свежие сверху.
CREATE INDEX IF NOT EXISTS event_favorites_user_created_idx
  ON event_favorites (user_id, created_at DESC);
