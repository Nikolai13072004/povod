-- Чат события (PROD-013).
--
-- Групповая переписка участников одного события. В отличие от личных сообщений
-- (014) диалог здесь не производная от пары: комната одна на событие, а право
-- в ней находиться — производная от УЧАСТИЯ. Отдельной таблицы членства нет
-- намеренно: список участников уже хранится в participants, и вторая таблица
-- о том же отношении разъезжалась бы с первой молча — ровно та причина, по
-- которой заявки в друзья не получили своей таблицы в 013, а диалоги — в 014.

-- Чат включает автор при создании события. По умолчанию выключен: молча
-- заводить комнату всем существующим событиям значило бы подарить каждому
-- автору обязанность модерировать переписку, о которой он не просил.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS event_messages (
  id TEXT PRIMARY KEY,
  -- CASCADE: удаление события уносит и его переписку. Держать сообщения без
  -- комнаты не для кого — доступ к ним выводится из участия в событии.
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Имя копируется в сообщение, как в уведомлениях (007): аккаунт могут
  -- удалить, а реплика в общей переписке обязана остаться подписанной.
  -- Заодно страница чата читается одним запросом, без JOIN к users.
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  -- Метку пишет приложение, не DEFAULT now(): now() даёт микросекунды, а курсор
  -- уезжает клиенту с точностью до миллисекунды — усечённый курсор молча терял
  -- бы сообщения той же миллисекунды (см. 014).
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT event_messages_text_not_blank CHECK (length(btrim(text)) > 0)
);

-- Страница чата. Колонки повторяют ORDER BY created_at DESC, id DESC — тот же
-- keyset-курсор, что у переписки и ленты: разойдутся — страницы начнут терять
-- записи на границе.
CREATE INDEX IF NOT EXISTS event_messages_event_idx
  ON event_messages (event_id, created_at DESC, id DESC);

-- Новый тип уведомления «у события есть чат». CHECK в 007 объявлен без имени и
-- пересоздавался в 014 — снимаем и добавляем расширенный, иначе старый молча
-- отклонит вставку, а доставка уведомлений гасит ошибку в лог (симптом —
-- «уведомление просто не пришло»).
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'event_updated',
      'event_cancelled',
      'event_comment',
      'event_joined',
      'direct_message',
      'friend_request',
      'friend_accepted',
      'event_chat'
    )
  );
