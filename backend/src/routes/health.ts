import type { Request, Response } from "express";
import { config } from "../config";

/**
 * Health-эндпоинты под ожидания фронтенда (rootStore / healthAPI):
 *   GET /health      -> { service, status, database_enabled }
 *   GET /api/ping    -> { message: "pong" }
 *   GET /api/db/time -> { time }
 */

export function health(_req: Request, res: Response): void {
  res.json({
    service: config.serviceName,
    status: "ok",
    database_enabled: true,
    timestamp: new Date().toISOString(),
  });
}

export function ping(_req: Request, res: Response): void {
  res.json({ message: "pong", service: config.serviceName, timestamp: new Date().toISOString() });
}

export function dbTime(_req: Request, res: Response): void {
  res.json({ time: new Date().toISOString(), now: Date.now() });
}
