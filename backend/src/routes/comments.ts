import { Router } from "express";
import { db, save, newId } from "../store";
import { asyncHandler, HttpError } from "../middleware";
import { commentCreateSchema } from "../validation";
import type { Comment, User } from "../types";

export const commentsRouter = Router();

const guest: User = {
  id: "guest",
  name: "Гость",
  email: "guest@povod.app",
  createdAt: new Date(0).toISOString(),
};

// GET /api/Comments/event/:eventId
commentsRouter.get(
  "/event/:eventId",
  asyncHandler(async (req, res) => {
    res.json(db.comments.filter((c) => c.eventId === req.params.eventId));
  }),
);

// POST /api/Comments  { text, eventId, author? }
commentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = commentCreateSchema.parse(req.body);

    let author: User = guest;
    if (data.author && typeof data.author === "object") {
      author = { ...guest, ...(data.author as Partial<User>) } as User;
    } else if (typeof data.author === "string") {
      author =
        db.users.find((u) => u.id === data.author || u.name === data.author) ?? {
          ...guest,
          name: data.author,
        };
    }

    const comment: Comment = {
      id: newId(),
      text: data.text,
      author,
      eventId: data.eventId,
      createdAt: new Date().toISOString(),
    };
    db.comments.push(comment);
    save();
    res.status(201).json(comment);
  }),
);

// DELETE /api/Comments/:id
commentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const i = db.comments.findIndex((c) => c.id === req.params.id);
    if (i === -1) throw new HttpError(404, "Comment not found");
    db.comments.splice(i, 1);
    save();
    res.status(204).send();
  }),
);
