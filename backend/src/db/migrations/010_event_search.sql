-- Полнотекстовый поиск (BE-012) и опора для постраничной выдачи (BE-003).

-- Поисковый вектор — генерируемая колонка: она пересчитывается самой базой при
-- каждой записи, поэтому не может разойтись с содержимым события. Триггер или
-- обновление из кода такой гарантии не дают.
--
-- Веса: совпадение в названии важнее, чем в месте, а место — чем в описании.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(location, '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS events_search_idx ON events USING GIN (search_vector);

-- Ключ постраничной выдачи — пара «дата создания + id»: одной даты мало, у
-- нескольких событий она совпадает с точностью до микросекунды, и такая
-- страница либо теряла бы записи, либо показывала их дважды.
CREATE INDEX IF NOT EXISTS events_feed_cursor_idx ON events (created_at DESC, id DESC);

-- Устойчивость к опечаткам — необязательное улучшение поверх основного поиска.
-- Расширение доступно не в каждом управляемом PostgreSQL, а падать из-за него
-- при старте нельзя: поиск работает и без него, просто без «почти совпадений».
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS events_title_trgm_idx ON events USING GIN (title gin_trgm_ops);
EXCEPTION
  WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
    RAISE NOTICE 'pg_trgm недоступен — поиск работает без устойчивости к опечаткам';
END
$$;
