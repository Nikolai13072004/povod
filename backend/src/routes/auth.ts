import { Router } from "express";
import { db, save } from "../store";
import { asyncHandler, HttpError } from "../middleware";
import { config } from "../config";
import { verifyVkLaunch, getVkUserId } from "../vk";
import type { User } from "../types";

export const authRouter = Router();

/**
 * POST /api/Auth/vk
 * Body: { launchParams: string, profile?: { name?: string; avatar?: string } }
 *
 * Авторизация пользователя VK Mini App:
 *   - проверяет подпись launch-параметров (если задан VK_APP_SECRET);
 *   - находит или создаёт пользователя (upsert) по vk_user_id;
 *   - возвращает запись пользователя.
 */
authRouter.post(
  "/vk",
  asyncHandler(async (req, res) => {
    const launchParams = String(req.body?.launchParams ?? "");
    const profile = (req.body?.profile ?? {}) as { name?: string; avatar?: string };

    // 1. Проверка подлинности
    if (config.vkAppSecret) {
      if (!verifyVkLaunch(launchParams, config.vkAppSecret)) {
        throw new HttpError(401, "Invalid VK launch signature");
      }
    } else {
      console.warn("[auth] VK_APP_SECRET не задан — подпись НЕ проверяется (дев-режим)");
    }

    // 2. Идентификация
    const vkUserId = getVkUserId(launchParams);
    if (!vkUserId) throw new HttpError(400, "vk_user_id отсутствует в launchParams");

    const id = `vk_${vkUserId}`;

    // 3. Upsert пользователя
    let user = db.users.find((u) => u.id === id);
    if (!user) {
      user = {
        id,
        name: profile.name?.trim() || `Пользователь ${vkUserId}`,
        email: `${id}@vk.local`,
        avatar: profile.avatar,
        interests: [],
        friends: [],
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
    } else {
      if (profile.name?.trim()) user.name = profile.name.trim();
      if (profile.avatar) user.avatar = profile.avatar;
    }
    save();

    res.json(user);
  }),
);
