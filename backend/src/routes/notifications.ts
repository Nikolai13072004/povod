import { Router } from "express";
import { getRepository } from "../store.js";
import { asyncHandler } from "../middleware.js";
import { getAuthUser, requireAuth, type AuthLocals } from "../auth/middleware.js";
import { NOTIFICATION_FEED_LIMIT } from "../notifications.js";
import { markNotificationsSchema } from "../validation.js";

export const notificationsRouter = Router();

/**
 * Отдельный дешёвый счётчик для значка на колокольчике: он нужен на каждой
 * странице, а тянуть ради числа полсотни записей незачем. В PostgreSQL запрос
 * попадает в частичный индекс по непрочитанным (миграция 007).
 */
notificationsRouter.get(
  "/unread",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    res.json({ unread: await getRepository().countUnreadNotifications(user.id) });
  }),
);

notificationsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const repository = getRepository();
    const [items, unread] = await Promise.all([
      repository.listNotifications(user.id, NOTIFICATION_FEED_LIMIT),
      repository.countUnreadNotifications(user.id),
    ]);
    res.json({ items, unread });
  }),
);

notificationsRouter.post(
  "/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const { ids } = markNotificationsSchema.parse(req.body ?? {});
    const repository = getRepository();
    // Пометка чужих уведомлений невозможна: обновление всегда ограничено
    // `user_id` текущей сессии, а не только переданными идентификаторами.
    await repository.markNotificationsRead(user.id, new Date().toISOString(), ids);
    res.json({ unread: await repository.countUnreadNotifications(user.id) });
  }),
);
