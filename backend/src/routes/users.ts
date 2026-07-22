import { Router } from "express";
import { db, save } from "../store";
import { asyncHandler, HttpError } from "../middleware";
import { friendAddSchema } from "../validation";

export const usersRouter = Router();

// GET /api/Users
usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(db.users);
  }),
);

// GET /api/Users/:id
usersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const u = db.users.find((x) => x.id === req.params.id);
    if (!u) throw new HttpError(404, "User not found");
    res.json(u);
  }),
);

// DELETE /api/Users/:id
usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const i = db.users.findIndex((x) => x.id === req.params.id);
    if (i === -1) throw new HttpError(404, "User not found");
    db.users.splice(i, 1);
    save();
    res.status(204).send();
  }),
);

// GET /api/Users/:id/friends
usersRouter.get(
  "/:id/friends",
  asyncHandler(async (req, res) => {
    const u = db.users.find((x) => x.id === req.params.id);
    if (!u) throw new HttpError(404, "User not found");
    const friends = db.users.filter((x) => (u.friends ?? []).includes(x.id));
    res.json(friends);
  }),
);

// POST /api/Users/:id/friends  { friendId }
usersRouter.post(
  "/:id/friends",
  asyncHandler(async (req, res) => {
    const u = db.users.find((x) => x.id === req.params.id);
    if (!u) throw new HttpError(404, "User not found");
    const { friendId } = friendAddSchema.parse(req.body);
    if (!db.users.some((x) => x.id === friendId)) throw new HttpError(404, "Friend not found");
    u.friends = u.friends ?? [];
    if (!u.friends.includes(friendId)) u.friends.push(friendId);
    save();
    res.status(201).json(u);
  }),
);

// DELETE /api/Users/:id/friends/:friendId
usersRouter.delete(
  "/:id/friends/:friendId",
  asyncHandler(async (req, res) => {
    const u = db.users.find((x) => x.id === req.params.id);
    if (!u) throw new HttpError(404, "User not found");
    u.friends = (u.friends ?? []).filter((f) => f !== req.params.friendId);
    save();
    res.status(204).send();
  }),
);
