import "dotenv/config"; // должен идти первым: загружает .env в process.env до чтения конфига
import { createApp } from "./app";
import { config } from "./config";
import { initStore } from "./store";
import { logger } from "./logger";
import { startSessionCleanup } from "./auth/sessionCleanup";
import { closePool } from "./db/pg";
import { createGracefulShutdown } from "./shutdown";

const app = createApp();

async function main() {
  await initStore();

  const storage = config.databaseUrl ? "PostgreSQL" : config.persist ? "data/db.json" : "in-memory";

  const server = app.listen(config.port, config.host, () => {
    logger.info(`\n🎉  POVOD backend запущен: http://localhost:${config.port}`);
    logger.info(`    health:   GET /health`);
    logger.info(`    events:   GET /api/Events`);
    logger.info(`    storage:  ${storage}`);
    logger.info(`    external: ${config.externalEvents ? "KudaGo (концерты/фестивали)" : "off"}`);
    logger.info(`    cors:     ${config.corsOrigin}\n`);
  });

  // Периодическая очистка истёкших/отозванных сессий (SEC-007).
  const stopCleanup = startSessionCleanup();

  // Graceful shutdown: по SIGTERM/SIGINT перестаём принимать запросы,
  // дожидаемся активных и закрываем пул БД (BE-001).
  const shutdown = createGracefulShutdown({ server, closePool, stopCleanup });
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void shutdown(signal).then(() => process.exit(0));
    });
  }

  // Прогрев кэша внешних событий (не блокирует старт)
  if (config.externalEvents) {
    const { getExternalEvents } = await import("./kudago");
    getExternalEvents().catch(() => {});
  }
}

main().catch((err) => {
  logger.error("[fatal] не удалось запустить сервер:", err);
  process.exit(1);
});
