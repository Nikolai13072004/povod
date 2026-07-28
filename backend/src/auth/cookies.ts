import { createHash, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { config } from "../config.js";

/**
 * Куки браузерной сессии (SEC-001).
 *
 * Раньше токен лежал в `sessionStorage`, то есть был доступен любому скрипту на
 * странице: одной XSS хватало, чтобы его выгрузить наружу и переиспользовать.
 * Теперь токен уезжает в `HttpOnly`-куку, недоступную JavaScript.
 *
 * Плата за куки — CSRF: браузер прикладывает их к запросу автоматически, в том
 * числе к запросу, инициированному чужим сайтом. Защита — double submit:
 *   - рядом с сессионной кукой ставится вторая, читаемая из JS (`povod_csrf`);
 *   - фронт копирует её значение в заголовок `X-CSRF-Token`;
 *   - сервер сверяет заголовок с ожидаемым значением.
 *
 * Ожидаемое значение выводится из самого токена сессии, а не хранится отдельно.
 * Так CSRF-токен нельзя подделать, не зная токена сессии, — обычный случайный
 * double submit от этого не защищает (значение можно навязать через куку
 * поддомена, см. docs/decisions/SEC-001-cookie-sessions.md).
 */

export const SESSION_COOKIE = "povod_session";
export const CSRF_COOKIE = "povod_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Значение CSRF-токена, соответствующее конкретной сессии. */
export function csrfTokenFor(sessionToken: string): string {
  return createHash("sha256").update(`povod-csrf:${sessionToken}`).digest("base64url");
}

/** Сравнение без утечки времени: длина сверяется отдельно, содержимое — постоянным временем. */
export function csrfTokenMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Разбор заголовка `Cookie`. Своя реализация вместо `cookie-parser`: нужен один
 * разбор без подписей и без ещё одной зависимости в проде.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name || name in result) continue; // первая пара выигрывает, как в браузере
    const rawValue = part.slice(separator + 1).trim();
    const value =
      rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue;
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value; // некорректный percent-encoding — берём как есть
    }
  }
  return result;
}

export function readCookie(req: Request, name: string): string {
  return parseCookies(req.headers.cookie)[name] ?? "";
}

function baseCookieOptions(): CookieOptions {
  return {
    secure: config.authCookieSecure,
    sameSite: config.authCookieSameSite,
    path: "/",
    ...(config.authCookieDomain ? { domain: config.authCookieDomain } : {}),
  };
}

/**
 * Кладёт пару кук на ответ.
 *
 * Срок жизни кук совпадает со сроком жизни серверной сессии: она отзываемая,
 * поэтому «протухшая» кука всё равно не даст доступа — сервер проверит запись.
 */
export function setSessionCookies(res: Response, token: string, expiresAt: string): void {
  const expires = new Date(expiresAt);
  const options = { ...baseCookieOptions(), expires };
  res.cookie(SESSION_COOKIE, token, { ...options, httpOnly: true });
  // CSRF-кука намеренно НЕ httpOnly: фронт обязан прочитать её и продублировать
  // в заголовок. Секрета она не содержит — это производная от токена сессии.
  res.cookie(CSRF_COOKIE, csrfTokenFor(token), { ...options, httpOnly: false });
}

export function clearSessionCookies(res: Response): void {
  const options = baseCookieOptions();
  res.clearCookie(SESSION_COOKIE, { ...options, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}
