import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import { config } from "./config.js";
import { loggerStream, redactText } from "./logger.js";
import { eventsRouter } from "./routes/events.js";
import { usersRouter } from "./routes/users.js";
import { commentsRouter } from "./routes/comments.js";
import { authRouter } from "./routes/auth.js";
import { notificationsRouter } from "./routes/notifications.js";
import { messagesRouter } from "./routes/messages.js";
import { health, live, ready, ping, dbTime } from "./routes/health.js";
import { csrfProtection } from "./auth/csrf.js";
import { notFound, errorHandler } from "./middleware.js";

/** Сборка Express-приложения (без listen — удобно для тестов). */
export function createApp() {
  const app = express();

  // Безопасные HTTP-заголовки: nosniff, frame policy (DENY), CSP, HSTS (в production) и др.
  // API отдаёт JSON и потребляется фронтом с другого origin — разрешаем cross-origin
  // доступ к ресурсам, не ослабляя остальные заголовки.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  // credentials: true — сессия живёт в HttpOnly-куке (SEC-001), а без этого флага
  // браузер её не отправит. С `*` credentials несовместим, поэтому в dev отражаем
  // origin запроса; в production wildcard и так запрещён валидацией конфига.
  app.use(
    cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin, credentials: true }),
  );
  /**
   * За прокси (Render, Cloudflare, nginx) `req.ip` без этой настройки — адрес
   * прокси, а не клиента. Rate limit ключуется именно по `req.ip`, поэтому все
   * посетители попадали в одно ведро: десяти неверных паролей одного человека
   * хватало, чтобы вход перестал работать у всех.
   *
   * Число хопов, а не `true`: при `true` Express верит всей цепочке
   * X-Forwarded-For, и клиент сам себе назначает любой адрес — лимит снова
   * обходится, только теперь бесшумно.
   */
  app.set("trust proxy", 1);
  // limit 10mb — фронт может слать фото как base64 data URL (до 5MB)
  app.use(express.json({ limit: "10mb" }));
  // Куку браузер прикладывает к запросу сам, в том числе с чужого сайта, — поэтому
  // изменяющие запросы с сессионной кукой обязаны нести заголовок X-CSRF-Token.
  app.use(csrfProtection);
  // Логи запросов проходят через централизованную редакцию (SEC-003): URL с секретами
  // в query-параметрах не попадёт в вывод, а сам поток идёт через logger.
  morgan.token("url", (req: express.Request) => redactText(req.originalUrl ?? req.url ?? ""));
  if (config.nodeEnv !== "test") app.use(morgan("dev", { stream: loggerStream }));

  // health / служебные
  app.get("/health", health);
  app.get("/health/live", live);
  app.get("/health/ready", ready);
  app.get("/api/ping", ping);
  app.get("/api/db/time", dbTime);

  // ресурсы (пути в PascalCase — как ожидает фронт; роутинг регистронезависим)
  app.use("/api/Auth", authRouter);
  app.use("/api/Events", eventsRouter);
  app.use("/api/Users", usersRouter);
  app.use("/api/Comments", commentsRouter);
  app.use("/api/Notifications", notificationsRouter);
  app.use("/api/Messages", messagesRouter);

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
