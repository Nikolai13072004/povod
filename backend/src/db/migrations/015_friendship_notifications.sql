-- Уведомления о заявках в друзья (SEC-015).
--
-- Заявка приходила молча: человек узнавал о ней, только зайдя в профиль и
-- увидев блок «Заявки». Колокольчик при этом не загорался, потому что
-- уведомления не порождалось вовсе — а именно им приложение сообщает обо всём
-- остальном.
--
-- Ограничение снимается по имени, которое PostgreSQL сгенерировал для inline
-- CHECK из миграции 007. Не снять — рядом появится второе, старое продолжит
-- отклонять новые типы, а доставка уведомлений гасит ошибку в лог: симптомом
-- будет «уведомления просто не приходят», без единой ошибки в ответе API.
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
      'friend_accepted'
    )
  );
