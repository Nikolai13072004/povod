-- Индекс для регулярной очистки истёкших сессий (SEC-007).
-- Существующий частичный индекс (user_id, expires_at) WHERE revoked_at IS NULL
-- оптимизирован под выборку активных сессий пользователя, но не под глобальное
-- удаление по времени. Отдельный индекс по expires_at ускоряет периодический cleanup.
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
  ON auth_sessions (expires_at);
