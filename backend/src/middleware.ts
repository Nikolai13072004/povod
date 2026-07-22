import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError } from "zod";

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
  const status = e.status ?? e.statusCode ?? 500;
  const message = e.message ?? "Internal Server Error";
  if (status >= 500) console.error("[error]", err);
  res.status(status).json({ error: message, status });
}
