import type { Request, RequestHandler } from "express";
import { asyncHandler, HttpError } from "../middleware";
import { resolveSession } from "./session";
import { SESSION_COOKIE, readCookie } from "./cookies";
import type { User } from "../types";

export interface AuthLocals {
  authUser?: User;
  authSessionId?: string;
}

function getBearerToken(req: Request): string {
  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

/**
 * Источники токена в порядке приоритета: `HttpOnly`-кука браузера (SEC-001),
 * затем заголовок `Authorization` — им пользуются VK Mini App внутри iframe,
 * где сторонние куки могут быть заблокированы, и не-браузерные клиенты.
 */
async function resolveRequestSession(req: Request) {
  for (const token of [readCookie(req, SESSION_COOKIE), getBearerToken(req)]) {
    if (!token) continue;
    const session = await resolveSession(token);
    if (session) return session;
  }
  return undefined;
}

export const optionalAuth: RequestHandler = asyncHandler(async (req, res, next) => {
  const session = await resolveRequestSession(req);
  if (session) {
    const locals = res.locals as AuthLocals;
    locals.authUser = session.user;
    locals.authSessionId = session.id;
  }
  next();
});

export const requireAuth: RequestHandler = asyncHandler(async (req, res, next) => {
  const session = await resolveRequestSession(req);
  if (!session) throw new HttpError(401, "Authentication required");
  const locals = res.locals as AuthLocals;
  locals.authUser = session.user;
  locals.authSessionId = session.id;
  next();
});

export function getAuthUser(locals: AuthLocals): User {
  if (!locals.authUser) throw new HttpError(401, "Authentication required");
  return locals.authUser;
}
