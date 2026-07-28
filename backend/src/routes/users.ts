import { Router } from "express";
import { getRepository } from "../store.js";
import { asyncHandler, HttpError } from "../middleware.js";
import { friendAddSchema, profileUpdateSchema } from "../validation.js";
import { getAuthUser, requireAuth, type AuthLocals } from "../auth/middleware.js";
import { presentPublicUser } from "../presenters.js";

export const usersRouter = Router();

/**
 * Каталог пользователей.
 *
 * `requireAuth`, потому что раньше этот адрес отвечал кому угодно без входа:
 * имена, аватары, города и социальный граф всего сервиса выгружались одним
 * запросом. Ограничение размера — оттуда же: список отдавался целиком.
 */
const MAX_USER_PAGE = 100;

usersRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const users = await getRepository().listUsers();
    res.json(users.slice(0, MAX_USER_PAGE).map(presentPublicUser));
  }),
);

/**
 * Обновление собственного профиля (BE-010).
 * Объявлен до `/:id`, иначе «me» попал бы в параметр маршрута.
 */
usersRouter.put(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = getAuthUser(res.locals as AuthLocals);
    const patch = profileUpdateSchema.parse(req.body);

    const updated = await getRepository().upsertUser({
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.city !== undefined ? { city: patch.city || undefined } : {}),
      ...(patch.avatar !== undefined ? { avatar: patch.avatar || undefined } : {}),
      ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
    });

    // Себе отдаём полный профиль (с email), а не публичное представление.
    res.json(updated);
  }),
);

usersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await getRepository().getUser(req.params.id);
    if (!user) throw new HttpError(404, "User not found");
    res.json(presentPublicUser(user));
  }),
);

usersRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (user.id !== req.params.id) throw new HttpError(403, "Forbidden");
    if (!(await getRepository().deleteUser(user.id))) {
      throw new HttpError(409, "User owns events or comments");
    }
    res.status(204).send();
  }),
);

usersRouter.get(
  "/:id/friends",
  // Тоже под авторизацией: связи людей — не публичные данные.
  requireAuth,
  asyncHandler(async (req, res) => {
    const friends = await getRepository().listFriends(req.params.id);
    if (!friends) throw new HttpError(404, "User not found");
    res.json(friends.map(presentPublicUser));
  }),
);

/** Свои заявки: входящие и исходящие. Чужие не показываются никому (SEC-012). */
usersRouter.get(
  "/:id/friends/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (user.id !== req.params.id) throw new HttpError(403, "Forbidden");
    const requests = await getRepository().listFriendRequests(user.id);
    if (!requests) throw new HttpError(404, "User not found");
    res.json({
      incoming: requests.incoming.map(presentPublicUser),
      outgoing: requests.outgoing.map(presentPublicUser),
    });
  }),
);

usersRouter.post(
  "/:id/friends/requests/:requesterId/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (user.id !== req.params.id) throw new HttpError(403, "Forbidden");
    if (!(await getRepository().acceptFriendRequest(user.id, req.params.requesterId))) {
      // Заявку успели отозвать, её не было или она уже принята — снаружи это
      // одно и то же: принимать нечего.
      throw new HttpError(404, "Friend request not found");
    }
    res.status(204).send();
  }),
);

usersRouter.post(
  "/:id/friends",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (user.id !== req.params.id) throw new HttpError(403, "Forbidden");
    const { friendId } = friendAddSchema.parse(req.body);
    const outcome = await getRepository().requestFriendship(user.id, friendId);
    switch (outcome) {
      case "not-found":
        throw new HttpError(404, "Friend not found");
      case "self":
        throw new HttpError(400, "Нельзя добавить в друзья самого себя");
      case "accepted":
        // Встречная заявка уже висела — этот вызов её принял.
        res.status(200).json({ status: "accepted" });
        return;
      case "already-friends":
        res.status(200).json({ status: "accepted" });
        return;
      case "already-requested":
        // Повторное нажатие идемпотентно: заявка одна, и она уже отправлена.
        res.status(200).json({ status: "pending" });
        return;
      case "requested":
        res.status(201).json({ status: "pending" });
    }
  }),
);

usersRouter.delete(
  "/:id/friends/:friendId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (user.id !== req.params.id) throw new HttpError(403, "Forbidden");
    // Один маршрут на три действия: расторгнуть дружбу, отклонить чужую заявку
    // и отозвать свою. Снаружи это одно и то же — убрать связь.
    const removed = await getRepository().removeFriend(user.id, req.params.friendId);
    if (removed === undefined) throw new HttpError(404, "Friend not found");
    res.status(204).send();
  }),
);
