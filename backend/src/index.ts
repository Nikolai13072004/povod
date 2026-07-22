import "dotenv/config"; // должен идти первым: загружает .env в process.env до чтения конфига
import { createApp } from "./app";
import { config } from "./config";
import { initStore } from "./store";

const app = createApp();

async function main() {
  await initStore();

  const storage = config.databaseUrl ? "PostgreSQL" : config.persist ? "data/db.json" : "in-memory";

  app.listen(config.port, config.host, () => {
    console.log(`\n🎉  POVOD backend запущен: http://localhost:${config.port}`);
    console.log(`    health:   GET /health`);
    console.log(`    events:   GET /api/Events`);
    console.log(`    storage:  ${storage}`);
    console.log(`    external: ${config.externalEvents ? "KudaGo (концерты/фестивали)" : "off"}`);
    console.log(`    cors:     ${config.corsOrigin}\n`);
  });

  // Прогрев кэша внешних событий (не блокирует старт)
  if (config.externalEvents) {
    const { getExternalEvents } = await import("./kudago");
    getExternalEvents().catch(() => {});
  }
}

main().catch((err) => {
  console.error("[fatal] не удалось запустить сервер:", err);
  process.exit(1);
});
