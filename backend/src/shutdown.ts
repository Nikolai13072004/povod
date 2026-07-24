import { logger } from "./logger";

/** Минимальный контракт HTTP-сервера, нужный для остановки (упрощает тесты). */
export interface ClosableServer {
  close(callback?: (error?: Error) => void): unknown;
}

export interface ShutdownDeps {
  server: ClosableServer;
  /** Закрытие пула БД (no-op, если БД не используется). */
  closePool: () => Promise<void>;
  /** Остановка фоновых задач (например, очистки сессий). */
  stopCleanup?: () => void;
  /** Предел ожидания активных запросов перед принудительным закрытием, мс. */
  timeoutMs?: number;
}

/**
 * Собирает функцию graceful shutdown (BE-001): перестаём принимать новые
 * соединения, дожидаемся активных запросов (с таймаутом), затем закрываем
 * пул БД и фоновые задачи. Повторные вызовы игнорируются.
 */
export function createGracefulShutdown(deps: ShutdownDeps): (reason?: string) => Promise<void> {
  let started = false;

  return async (reason?: string) => {
    if (started) return;
    started = true;

    logger.info(`[shutdown] завершение (${reason ?? "signal"}): перестаём принимать запросы…`);
    deps.stopCleanup?.();

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };

      // Таймер намеренно НЕ unref-ится: во время остановки мы должны дождаться
      // дренажа активных запросов (или таймаута), а не дать процессу выйти раньше.
      const timer = setTimeout(() => {
        logger.warn("[shutdown] активные запросы не завершились вовремя — закрываем принудительно");
        finish();
      }, deps.timeoutMs ?? 10_000);

      deps.server.close((error) => {
        clearTimeout(timer);
        if (error) logger.warn("[shutdown] ошибка при закрытии HTTP-сервера:", error);
        finish();
      });
    });

    try {
      await deps.closePool();
    } catch (error) {
      logger.warn("[shutdown] ошибка при закрытии пула БД:", error);
    }

    logger.info("[shutdown] завершено");
  };
}
