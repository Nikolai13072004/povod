/**
 * Конфигурация сервиса из переменных окружения.
 * Безопасные дефолты, чтобы сервер поднимался без .env.
 */
export const config = {
  port: Number(process.env.PORT) || 8080,
  host: process.env.HOST || "0.0.0.0",
  /** Персистентность в data/db.json. По умолчанию включена (выключается PERSIST=false). */
  persist: process.env.PERSIST !== "false",
  /** CORS origin: "*" для дев-режима, конкретный домен для прода. */
  corsOrigin: process.env.CORS_ORIGIN || "*",
  serviceName: process.env.SERVICE_NAME || "povod-backend",
  nodeEnv: process.env.NODE_ENV || "development",
  /** Защищённый ключ VK-приложения. Если пусто — подпись launch-параметров НЕ проверяется (дев-режим). */
  vkAppSecret: process.env.VK_APP_SECRET || "",
  vkAppId: process.env.VK_APP_ID || "",
  /** Строка подключения к PostgreSQL. Если задана — данные хранятся в БД; иначе in-memory/JSON. */
  databaseUrl: process.env.DATABASE_URL || "",
  /** Подмешивать реальные концерты/фестивали из KudaGo в ленту (по умолчанию вкл). */
  externalEvents: process.env.ENABLE_EXTERNAL_EVENTS !== "false",
} as const;
