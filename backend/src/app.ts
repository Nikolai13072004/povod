import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config";
import { eventsRouter } from "./routes/events";
import { usersRouter } from "./routes/users";
import { commentsRouter } from "./routes/comments";
import { authRouter } from "./routes/auth";
import { health, ping, dbTime } from "./routes/health";
import { notFound, errorHandler } from "./middleware";

/** Сборка Express-приложения (без listen — удобно для тестов). */
export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  // limit 10mb — фронт может слать фото как base64 data URL (до 5MB)
  app.use(express.json({ limit: "10mb" }));
  if (config.nodeEnv !== "test") app.use(morgan("dev"));

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
