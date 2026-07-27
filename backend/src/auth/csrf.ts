import type { RequestHandler } from "express";
import { HttpError } from "../middleware";
import { CSRF_HEADER, SESSION_COOKIE, csrfTokenFor, csrfTokenMatches, readCookie } from "./cookies";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Точки входа проверку не проходят — иначе получается ловушка без выхода.
 *
 * Если CSRF-кука пропала, а сессионная осталась (её вычистило расширение, или
 * пользователь стёр видимые куки), то запрос на вход придёт с сессионной кукой,
 * но без заголовка — и уткнётся в 403. Войти заново, чтобы починить состояние,
 * тоже нельзя: вход и есть заблокированный запрос. Успешный вход, наоборот,
 * выдаёт свежую пару кук и приводит состояние в порядок.
 *
 * Риск при этом небольшой: подделать можно только «вход в чужой аккаунт», где
 * атакующий подставляет собственные учётные данные. Куки жертвы для этого не
 * нужны, поэтому double submit от такого и не защищает; работает `SameSite`.
 * Выход из аккаунта проверку проходит на общих основаниях.
 */
const CSRF_EXEMPT_PATHS = new Set(["/api/auth/login", "/api/auth/register", "/api/auth/vk"]);

/**
 * Защита от CSRF для запросов, аутентифицированных кукой (SEC-001).
 *
 * Проверка включается ровно там, где есть риск: небезопасный метод И присланная
 * браузером сессионная кука. Запросы с `Authorization: Bearer` (VK Mini App,
 * мобильные клиенты, тесты) проверку не проходят — заголовок не подставляется
 * автоматически, поэтому чужой сайт его и не пришлёт.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  // Роутинг Express регистронезависим — сравниваем так же.
  if (CSRF_EXEMPT_PATHS.has(req.path.toLowerCase())) return next();

  const sessionToken = readCookie(req, SESSION_COOKIE);
  if (!sessionToken) return next();

  const received = String(req.headers[CSRF_HEADER] ?? "");
  if (!received || !csrfTokenMatches(csrfTokenFor(sessionToken), received)) {
    throw new HttpError(403, "CSRF token missing or invalid");
  }
  next();
};
