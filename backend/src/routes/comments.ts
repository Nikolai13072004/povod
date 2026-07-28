import { Router } from "express";
import { getRepository, newId } from "../store.js";
import { asyncHandler, HttpError } from "../middleware.js";
import { commentCreateSchema } from "../validation.js";
import { getAuthUser, optionalAuth, requireAuth, type AuthLocals } from "../auth/middleware.js";
import { presentComment } from "../presenters.js";
import { notifyEventComment } from "../notifications.js";

export const commentsRouter = Router();

commentsRouter.get(
  "/event/:eventId",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const event = await getRepository().getEvent(req.params.eventId);
    if (!event) throw new HttpError(404, "Event not found");
    const userId = (res.locals as AuthLocals).authUser?.id;
    if (
      event.format === "private" &&
      event.authorId !== userId &&
      !Boolean(userId && event.participantIds.includes(userId))
    ) {
      throw new HttpError(404, "Event not found");
    }
    res.json((await getRepository().listComments(event.id)).map(presentComment));
  }),
);

commentsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = commentCreateSchema.parse(req.body);
    const repository = getRepository();
    const event = await repository.getEvent(data.eventId);
    if (!event) throw new HttpError(404, "Event not found");
    const author = getAuthUser(res.locals as AuthLocals);
    if (
      event.format === "private" &&
      event.authorId !== author.id &&
      !event.participantIds.includes(author.id)
    ) {
      throw new HttpError(403, "Invitation required");
    }
    const comment = await repository.createComment({
      id: newId(),
      text: data.text,
      eventId: event.id,
      authorId: author.id,
      createdAt: new Date().toISOString(),
    });
    await notifyEventComment(event, author);
    res.status(201).json(presentComment(comment));
  }),
);

commentsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const repository = getRepository();
    const comment = await repository.getComment(req.params.id);
    if (!comment) throw new HttpError(404, "Comment not found");
    const event = await repository.getEvent(comment.eventId);
    const userId = getAuthUser(res.locals as AuthLocals).id;
    if (comment.author.id !== userId && event?.authorId !== userId) {
      throw new HttpError(403, "Only the comment or event author can delete it");
    }
    await repository.deleteComment(comment.id);
    res.status(204).send();
  }),
);
