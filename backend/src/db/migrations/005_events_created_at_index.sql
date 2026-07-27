-- Индекс под сортировку ленты по умолчанию (BE-005).
-- `listEvents` без явной сортировки отдаёт события как `ORDER BY e.created_at DESC` —
-- это самый частый запрос приложения, но индекса по `created_at` не было,
-- поэтому лента требовала полной сортировки таблицы.
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at DESC);
