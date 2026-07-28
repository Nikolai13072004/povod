import { getRepository } from "../store.js";
import { logger } from "../logger.js";

/** Периодичность очистки истёкших/отозванных сессий по умолчанию — 1 час. */
export const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Разовый прогон очистки. Возвращает число удалённых записей.
 *
 * Заодно чистятся использованные и просроченные токены восстановления пароля
 * (SEC-008): у них та же природа — короткоживущие одноразовые записи, которые
 * иначе копились бы вечно.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const repository = getRepository();
  const now = new Date().toISOString();
  const sessions = await repository.deleteExpiredSessions(now);
  const resetTokens = await repository.deleteExpiredPasswordResetTokens(now);
  if (sessions > 0) {
    logger.info(`[sessions] очищено истёкших/отозванных сессий: ${sessions}`);
  }
  if (resetTokens > 0) {
    logger.info(`[sessions] очищено токенов восстановления пароля: ${resetTokens}`);
  }
  return sessions + resetTokens;
}

/**
 * Запускает периодическую очистку: разово при старте и далее по интервалу.
 * Таймер `unref`-ится, чтобы не удерживать процесс от штатного завершения.
 * Возвращает функцию остановки.
 */
export function startSessionCleanup(intervalMs = DEFAULT_CLEANUP_INTERVAL_MS): () => void {
  const run = (): void => {
    void cleanupExpiredSessions().catch((error) => {
      logger.warn("[sessions] очистка сессий не удалась:", error);
    });
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
