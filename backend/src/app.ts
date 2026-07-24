import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import { config } from "./config";
import { loggerStream, redactText } from "./logger";
import { eventsRouter } from "./routes/events";
import { usersRouter } from "./routes/users";
import { commentsRouter } from "./routes/comments";
import { authRouter } from "./routes/auth";
import { health, ping, dbTime } from "./routes/health";
import { notFound, errorHandler } from "./middleware";

/** Сборка Express-приложения (без listen — удобно для тестов). */
export function createApp() {
  const app = express();

  // Безопасные HTTP-заголовки: nosniff, frame policy (DENY), CSP, HSTS (в production) и др.
  // API отдаёт JSON и потребляется фронтом с другого origin — разрешаем cross-origin
  // доступ к ресурсам, не ослабляя остальные заголовки.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  app.use(cors({ origin: config.corsOrigin }));
  // limit 10mb — фронт может слать фото как base64 data URL (до 5MB)
  app.use(express.json({ limit: "10mb" }));
  // Логи запросов проходят через централизованную редакцию (SEC-003): URL с секретами
  // в query-параметрах не попадёт в вывод, а сам поток идёт через logger.
  morgan.token("url", (req: express.Request) => redactText(req.originalUrl ?? req.url ?? ""));
  if (config.nodeEnv !== "test") app.use(morgan("dev", { stream: loggerStream }));

  // health / служебные
  app.get("/health", health);
  app.get("/api/ping", ping);
  app.get("/api/db/time", dbTime);

  // ресурсы (пути в PascalCase — как ожидает фронт; роутинг регистронезависим)
  app.use("/api/Auth", authRouter);
  app.use("/api/Events", eventsRouter);
  app.use("/api/Users", usersRouter);
  app.use("/api/Comments", commentsRouter);

  app.get("/", (_req, res) => {
    res.json({
      service: config.serviceName,
      status: "ok",
      endpoints: ["/health", "/api/ping", "/api/Events", "/api/Users", "/api/Comments"],
    });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
