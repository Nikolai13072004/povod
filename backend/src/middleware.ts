import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "./logger.js";

/** Обёртка для async-роутов: пробрасывает ошибки в errorHandler. */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** HTTP-ошибка с явным статусом. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not Found", status: 404 });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", status: 400, issues: err.issues });
    return;
  }
  const e = err as { status?: number; statusCode?: number; message?: string };
  const databaseError = err as { code?: string };
  if (databaseError.code === "23505") {
    res.status(409).json({ error: "Resource already exists", status: 409 });
    return;
  }
  if (databaseError.code === "23503") {
    res.status(409).json({ error: "Resource is still in use", status: 409 });
    return;
  }
  // 23514 — нарушение CHECK, 22001 — строка длиннее колонки, 22003 — число вне
  // диапазона. Всё это неверный ввод, дошедший до базы мимо схемы: отвечать на
  // него 500 неправильно вдвойне — клиент видит «сбой сервера» вместо «поправьте
  // поле», а в error-лог сыплются мнимые аварии.
  if (databaseError.code === "23514" || databaseError.code === "22001") {
    res.status(400).json({ error: "Validation failed", status: 400 });
    return;
  }
  const status = e.status ?? e.statusCode ?? 500;
  if (status >= 500) {
    logger.error("[error]", err);
    // Наружу — ничего своего. Текст необработанной ошибки выдаёт имя пользователя
    // базы, внутренний хост, имена таблиц и ограничений; редакция применялась
    // только к логу, а в ответ уходил оригинал.
    res.status(status).json({ error: "Internal Server Error", status });
    return;
  }
  res.status(status).json({ error: e.message ?? "Request failed", status });
}
