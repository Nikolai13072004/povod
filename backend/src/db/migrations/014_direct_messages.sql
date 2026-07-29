-- Личные сообщения (PROD-011).
--
-- Диалог не заводится отдельной сущностью: групповых чатов нет, поэтому диалог —
-- производная от пары собеседников. Таблица диалогов была бы вторым местом, где
-- хранится одно отношение, и обязанностью держать их согласованными — ровно по
-- той же причине заявки в друзья не получили своей таблицы в 013.

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  -- Канонический ключ пары («меньший id : больший id»), тот же приём, что
  -- canonicalFriendship. Он существует ради ОДНОГО индекса под запрос
  -- переписки: без него условие «(A→B) ИЛИ (B→A)» разваливается на два
  -- индекса, BitmapOr и сортировку в памяти, а страница курсора обязана
  -- читаться прямо из индекса, как лента событий (BE-003).
  thread_key TEXT NOT NULL,
  -- CASCADE, а не RESTRICT: удаление аккаунта не должно упираться в переписку,
  -- как оно упирается в авторство событий. Согласовано с notifications.user_id.
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  -- Метку времени пишет приложение, а не DEFAULT now(): now() даёт
  -- микросекунды, а курсор уезжает клиенту с точностью до миллисекунды.
  -- Усечённый курсор против микросекундной метки молча теряет сообщения,
  -- отправленные в ту же миллисекунду. Так же поступают события и комментарии.
  created_at TIMESTAMPTZ NOT NULL,
  -- Правка оставляет отметку, а не подменяет текст молча: собеседник обязан
  -- видеть, что реплика изменилась после отправки (как у комментариев, BE-009).
  edited_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  CONSTRAINT direct_messages_text_not_blank CHECK (length(btrim(text)) > 0),
  CONSTRAINT direct_messages_not_self CHECK (sender_id <> recipient_id),
  CONSTRAINT direct_messages_thread_key_check CHECK (
    thread_key = least(sender_id, recipient_id) || ':' || greatest(sender_id, recipient_id)
  ),
  CONSTRAINT direct_messages_edited_after_created CHECK (edited_at IS NULL OR edited_at >= created_at),
  CONSTRAINT direct_messages_read_after_created CHECK (read_at IS NULL OR read_at >= created_at)
);

-- Страница переписки. Колонки повторяют ORDER BY created_at DESC, id DESC, под
-- который написано кортежное сравнение курсора. Разойдутся — keyset перестанет
-- читаться из индекса и начнёт терять записи на границе страниц.
CREATE INDEX IF NOT EXISTS direct_messages_thread_idx
  ON direct_messages (thread_key, created_at DESC, id DESC);

-- Список диалогов: последнее сообщение по каждому собеседнику. Индексов два,
-- потому что в своих диалогах человек бывает и отправителем, и получателем.
CREATE INDEX IF NOT EXISTS direct_messages_sender_created_idx
  ON direct_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_created_idx
  ON direct_messages (recipient_id, created_at DESC);

-- Счётчик непрочитанных спрашивается поллингом у каждого открытого клиента.
-- Частичный индекс держит только непрочитанные и не растёт вместе с историей —
-- как notifications_user_unread_idx (007).
CREATE INDEX IF NOT EXISTS direct_messages_unread_idx
  ON direct_messages (recipient_id, sender_id)
  WHERE read_at IS NULL;

-- Уведомление о личном сообщении. CHECK в 007 объявлен inline и без имени,
-- поэтому PostgreSQL сгенерировал его как notifications_type_check — снимаем
-- именно его. Иначе рядом появится второй CHECK, старый продолжит отклонять
-- новый тип, а доставка уведомления гасит ошибку в лог: симптомом будет
-- «уведомления просто не приходят», без единой ошибки в ответе API.
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN ('event_updated', 'event_cancelled', 'event_comment', 'event_joined', 'direct_message')
  );

-- У сообщения нет события, а event_title объявлена NOT NULL (007). Писать туда
-- суррогат значило бы врать контракту, поэтому колонка становится
-- необязательной; существующие строки не меняются.
ALTER TABLE notifications
  ALTER COLUMN event_title DROP NOT NULL;
