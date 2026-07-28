-- Заявки в друзья (SEC-012).
--
-- До этого дружба возникала односторонним нажатием: запись второго человека
-- менялась без его ведома, и он узнавал об этом, только открыв профиль.
--
-- Связь остаётся одной строкой в канонической паре (user_id < friend_id) —
-- отдельная таблица заявок означала бы два места, где хранится одно отношение,
-- и обязанность держать их согласованными. Вместо этого у строки появляется
-- состояние и автор.

ALTER TABLE friendships
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS requested_by TEXT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Существующие дружбы остаются дружбами: DEFAULT 'accepted' их не трогает.
-- `requested_by` у них NULL — кто кого позвал, мы честно не знаем.
ALTER TABLE friendships
  DROP CONSTRAINT IF EXISTS friendships_status_check;
ALTER TABLE friendships
  ADD CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted'));

-- Заявку мог отправить только один из двоих.
ALTER TABLE friendships
  DROP CONSTRAINT IF EXISTS friendships_requested_by_check;
ALTER TABLE friendships
  ADD CONSTRAINT friendships_requested_by_check
  CHECK (requested_by IS NULL OR requested_by IN (user_id, friend_id));

-- Ожидающая заявка обязана знать автора, иначе непонятно, кому её принимать.
ALTER TABLE friendships
  DROP CONSTRAINT IF EXISTS friendships_pending_author_check;
ALTER TABLE friendships
  ADD CONSTRAINT friendships_pending_author_check
  CHECK (status <> 'pending' OR requested_by IS NOT NULL);

-- Частичный индекс: заявок всегда на порядки меньше, чем принятых дружб,
-- а экран «Заявки» спрашивает именно их.
CREATE INDEX IF NOT EXISTS friendships_pending_idx
  ON friendships (requested_by)
  WHERE status = 'pending';
