import type { Request, Response } from "express";
import { config } from "../config";
import { getRepository } from "../store";

/**
 * Health-эндпоинты:
 *   GET /health       -> { service, status } (обратная совместимость с фронтендом)
 *   GET /health/live  -> liveness: процесс жив (не зависит от БД)
 *   GET /health/ready -> readiness: хранилище/БД реально доступны (200 или 503)
 *   GET /api/ping     -> { message: "pong" }
 *   GET /api/db/time  -> { time }
 */

export function health(_req: Request, res: Response): void {
  res.json({
    service: config.serviceName,
    status: "ok",
    database_enabled: true,
    timestamp: new Date().toISOString(),
  });
}

/** Liveness: отвечает, пока процесс жив. Не трогает БД — иначе перезапуск по недоступности БД. */
export function live(_req: Request, res: Response): void {
  res.json({ status: "alive", timestamp: new Date().toISOString() });
}

/** Readiness: готов ли сервис принимать трафик (хранилище инициализировано и доступно). */
export async function ready(_req: Request, res: Response): Promise<void> {
  try {
    await getRepository().ping();
    res.json({ status: "ready", checks: { store: "ok" }, timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({
      status: "not_ready",
      checks: { store: "error" },
      timestamp: new Date().toISOString(),
    });
  }
}

export function ping(_req: Request, res: Response): void {
  res.json({ message: "pong", service: config.serviceName, timestamp: new Date().toISOString() });
}

export function dbTime(_req: Request, res: Response): void {
  res.json({ time: new Date().toISOString(), now: Date.now() });
}
