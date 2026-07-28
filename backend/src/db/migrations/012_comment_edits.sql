-- Редактирование комментариев (BE-009).
--
-- Отметка о правке, а не молчаливая подмена текста: собеседники должны видеть,
-- что реплика изменилась после публикации. NULL — комментарий не правили.
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_edited_after_created;
ALTER TABLE comments
  ADD CONSTRAINT comments_edited_after_created
  CHECK (edited_at IS NULL OR edited_at >= created_at);
