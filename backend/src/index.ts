import "dotenv/config"; // должен идти первым: загружает .env в process.env до чтения конфига
import { createApp } from "./app";
import { config } from "./config";
import { initStore } from "./store";
import { logger } from "./logger";

const app = createApp();

async function main() {
  await initStore();

  const storage = config.databaseUrl ? "PostgreSQL" : config.persist ? "data/db.json" : "in-memory";

  app.listen(config.port, config.host, () => {
    logger.info(`\n🎉  POVOD backend запущен: http://localhost:${config.port}`);
    logger.info(`    health:   GET /health`);
    logger.info(`    events:   GET /api/Events`);
    logger.info(`    storage:  ${storage}`);
    logger.info(`    external: ${config.externalEvents ? "KudaGo (концерты/фестивали)" : "off"}`);
    logger.info(`    cors:     ${config.corsOrigin}\n`);
  });

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
