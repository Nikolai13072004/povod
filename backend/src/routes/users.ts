import { Router } from "express";
import { getRepository } from "../store";
import { asyncHandler, HttpError } from "../middleware";
import { friendAddSchema } from "../validation";
import { getAuthUser, requireAuth, type AuthLocals } from "../auth/middleware";
import { presentPublicUser } from "../presenters";

export const usersRouter = Router();

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json((await getRepository().listUsers()).map(presentPublicUser));
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
  asyncHandler(async (req, res) => {
    const friends = await getRepository().listFriends(req.params.id);
    if (!friends) throw new HttpError(404, "User not found");
    res.json(friends.map(presentPublicUser));
  }),
);

usersRouter.post(
  "/:id/friends",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (user.id !== req.params.id) throw new HttpError(403, "Forbidden");
    const { friendId } = friendAddSchema.parse(req.body);
    const updated = await getRepository().addFriend(user.id, friendId);
    if (!updated) throw new HttpError(404, "Friend not found");
    res.status(201).json(updated);
  }),
);

usersRouter.delete(
  "/:id/friends/:friendId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (user.id !== req.params.id) throw new HttpError(403, "Forbidden");
    const removed = await getRepository().removeFriend(user.id, req.params.friendId);
    if (removed === undefined) throw new HttpError(404, "Friend not found");
    res.status(204).send();
  }),
);
