import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getRepository } from "../store.js";
import { asyncHandler, HttpError } from "../middleware.js";
import { config } from "../config.js";
import { verifyVkLaunch, getVkUserId } from "../vk.js";
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  vkLoginSchema,
} from "../validation.js";
import { confirmPasswordReset, requestPasswordReset } from "../auth/passwordReset.js";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../auth/password.js";
import { issueSession, type IssuedSession } from "../auth/session.js";
import { getAuthUser, requireAuth, type AuthLocals } from "../auth/middleware.js";
import { clearSessionCookies, csrfTokenFor, setSessionCookies } from "../auth/cookies.js";
import type { User } from "../types.js";
import type { Response } from "express";
import { createAuthRateLimit } from "../auth/rateLimit.js";
import { logger } from "../logger.js";

export const authRouter = Router();
const loginRateLimit = createAuthRateLimit(10, 10 * 60 * 1000);
// Предел настраивается: синтетические окружения заводят десяток аккаунтов
// подряд с одного адреса, и для боевого значения это неотличимо от перебора.
// Ослабить его в production конфигурация не даёт.
const registerRateLimit = createAuthRateLimit(config.authRegisterLimit, 60 * 60 * 1000);
const vkRateLimit = createAuthRateLimit(20, 10 * 60 * 1000);
// Строже входа: перебор адресов здесь бесполезен по ответу, зато рассылка
// писем на чужие адреса — вполне себе злоупотребление.
const passwordResetRateLimit = createAuthRateLimit(5, 60 * 60 * 1000);

/**
 * Отдаёт выданную сессию: браузеру — в `HttpOnly`-куке (SEC-001), остальным — в теле.
 *
 * Токен остаётся в ответе намеренно: VK Mini App работает в iframe, где сторонние
 * куки может резать браузер, а интеграционные тесты и не-браузерные клиенты кук
 * вообще не ведут.
 *
 * CSRF-токен уезжает и кукой, и полем ответа. Кука — основной путь: её ставит
 * тот же домен, что и сессионную, и фронт читает её через `document.cookie`.
 *
 * Но при развёртывании, где фронт и API живут на разных доменах (типичный
 * случай на бесплатных хостингах: `povod-web.onrender.com` и
 * `povod-v1fg.onrender.com`), скрипты фронта эту куку **не видят вовсе** —
 * `document.cookie` показывает только куки своего домена. Сессионную куку
 * браузер при этом отправляет, поэтому сервер требует заголовок, а взять его
 * фронту неоткуда: получался 403 на первом же изменяющем запросе.
 *
 * Секрета это не раскрывает: токен и так лежал в куке, доступной скриптам, а
 * сам сессионный токен из него не восстанавливается — он производный, через
 * SHA-256.
 */
function respondWithSession(res: Response, session: IssuedSession, status = 200): void {
  setSessionCookies(res, session.token, session.expiresAt);
  res.status(status).json({ ...session, csrfToken: csrfTokenFor(session.token) });
}

authRouter.post(
  "/register",
  registerRateLimit,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const repository = getRepository();
    if (await repository.findUserByEmail(data.email)) {
      throw new HttpError(409, "Email already registered");
    }
    const user: User = {
      id: randomUUID(),
      name: data.name,
      email: data.email,
      interests: [],
      friends: [],
      createdAt: new Date().toISOString(),
    };
    const created = await repository.createPasswordUser(user, await hashPassword(data.password));
    respondWithSession(res, await issueSession(created), 201);
  }),
);

authRouter.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const repository = getRepository();
    const user = await repository.findUserByEmail(data.email);
    const passwordHash = user ? await repository.getPasswordHash(user.id) : undefined;
    const passwordMatches = await verifyPassword(
      data.password,
      passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordHash || !passwordMatches) {
      throw new HttpError(401, "Invalid email or password");
    }
    respondWithSession(res, await issueSession(user));
  }),
);

authRouter.get(
  "/session",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ user: getAuthUser(res.locals as AuthLocals) });
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const sessionId = (res.locals as AuthLocals).authSessionId;
    if (sessionId) await getRepository().revokeSession(sessionId);
    clearSessionCookies(res);
    res.status(204).send();
  }),
);

/**
 * Ответ одинаков независимо от того, есть такой адрес или нет (SEC-008).
 * Иначе форма превращается в способ выяснить, зарегистрирован ли человек.
 */
authRouter.post(
  "/password-reset",
  passwordResetRateLimit,
  asyncHandler(async (req, res) => {
    const { email } = passwordResetRequestSchema.parse(req.body);
    if (config.mailTransport === "none") {
      throw new HttpError(503, "Восстановление пароля сейчас недоступно");
    }
    await requestPasswordReset(email);
    res.status(204).send();
  }),
);

authRouter.post(
  "/password-reset/confirm",
  passwordResetRateLimit,
  asyncHandler(async (req, res) => {
    const { token, password } = passwordResetConfirmSchema.parse(req.body);
    const outcome = await confirmPasswordReset(token, password);
    if (outcome === "invalid-token") {
      // Просроченный, использованный и выдуманный токены неотличимы: любой из
      // них — просто «ссылка не подошла».
      throw new HttpError(400, "Ссылка недействительна или уже использована");
    }
    // Все сессии отозваны — включая эту, если пользователь был в аккаунте.
    clearSessionCookies(res);
    res.status(204).send();
  }),
);

authRouter.post(
  "/vk",
  vkRateLimit,
  asyncHandler(async (req, res) => {
    const { launchParams, profile = {} } = vkLoginSchema.parse(req.body ?? {});

    if (!config.vkAppSecret) {
      if (config.nodeEnv === "production") {
        throw new HttpError(503, "VK authentication is not configured");
      }
      logger.warn("[auth] VK_APP_SECRET не задан — подпись НЕ проверяется (dev only)");
    } else if (!verifyVkLaunch(launchParams, config.vkAppSecret)) {
      throw new HttpError(401, "Invalid VK launch signature");
    }

    const vkUserId = getVkUserId(launchParams);
    if (!vkUserId) throw new HttpError(400, "vk_user_id отсутствует в launchParams");

    const repository = getRepository();
    const externalUserId = String(vkUserId);
    const identity = await repository.getExternalIdentity("vk", externalUserId);
    let user = identity ? await repository.getUser(identity.userId) : undefined;

    if (!user) {
      const legacyId = `vk_${externalUserId}`;
      user = (await repository.getUser(legacyId)) ?? {
        id: randomUUID(),
        name: profile.name?.trim() || `Пользователь ${externalUserId}`,
        email: `vk-${externalUserId}@identity.povod.local`,
        avatar: profile.avatar,
        interests: [],
        friends: [],
        createdAt: new Date().toISOString(),
      };
    }

    if (profile.name?.trim()) user.name = profile.name.trim();
    if (profile.avatar) user.avatar = profile.avatar;
    user = await repository.upsertUser(user);
    await repository.linkExternalIdentity({
      provider: "vk",
      externalUserId,
      userId: user.id,
      profile: { name: user.name, avatar: user.avatar },
    });
    respondWithSession(res, await issueSession(user));
  }),
);
