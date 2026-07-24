import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getRepository } from "../store";
import { asyncHandler, HttpError } from "../middleware";
import { config } from "../config";
import { verifyVkLaunch, getVkUserId } from "../vk";
import { loginSchema, registerSchema } from "../validation";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../auth/password";
import { issueSession } from "../auth/session";
import { getAuthUser, requireAuth, type AuthLocals } from "../auth/middleware";
import type { User } from "../types";
import { createAuthRateLimit } from "../auth/rateLimit";
import { logger } from "../logger";

export const authRouter = Router();
const loginRateLimit = createAuthRateLimit(10, 10 * 60 * 1000);
const registerRateLimit = createAuthRateLimit(5, 60 * 60 * 1000);
const vkRateLimit = createAuthRateLimit(20, 10 * 60 * 1000);

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
    res.status(201).json(await issueSession(created));
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
    res.json(await issueSession(user));
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
    res.status(204).send();
  }),
);

authRouter.post(
  "/vk",
  vkRateLimit,
  asyncHandler(async (req, res) => {
    const launchParams = String(req.body?.launchParams ?? "");
    const profile = (req.body?.profile ?? {}) as { name?: string; avatar?: string };

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
    res.json(await issueSession(user));
  }),
);
