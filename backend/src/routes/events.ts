import { Router } from "express";
import { getRepository, newId } from "../store";
import { asyncHandler, HttpError } from "../middleware";
import { eventCreateSchema, eventUpdateSchema } from "../validation";
import { config } from "../config";
import { getExternalEvents, findExternalEvent } from "../kudago";
import type { Event } from "../types";
import { getAuthUser, optionalAuth, requireAuth, type AuthLocals } from "../auth/middleware";
import { notifyEventCancelled, notifyEventJoined, notifyEventUpdated } from "../notifications";

export const eventsRouter = Router();

function canViewEvent(event: Event, userId?: string): boolean {
  return (
    event.format !== "private" ||
    event.authorId === userId ||
    Boolean(userId && event.participantIds.includes(userId))
  );
}

function queryInstant(value: string | undefined, name: string): Date | undefined {
  if (!value) return undefined;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new HttpError(400, `${name} must be an ISO 8601 timestamp`);
  }
  return result;
}

eventsRouter.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { search, category, startsFrom, startsTo, author } = req.query as Record<string, string>;
    const viewerId = (res.locals as AuthLocals).authUser?.id;
    const local = await getRepository().listEvents({
      search,
      category,
      startsFrom: queryInstant(startsFrom, "startsFrom"),
      startsTo: queryInstant(startsTo, "startsTo"),
      author,
      viewerId,
    });
    const external = config.externalEvents ? await getExternalEvents() : [];
    res.json([...local, ...external]);
  }),
);

eventsRouter.get(
  "/active",
  optionalAuth,
  asyncHandler(async (_req, res) => {
    const activeAfter = new Date(Date.now() - 24 * 60 * 60 * 1000);
    res.json(
      await getRepository().listEvents({
        activeAfter,
        viewerId: (res.locals as AuthLocals).authUser?.id,
      }),
    );
  }),
);

eventsRouter.get(
  "/upcoming",
  optionalAuth,
  asyncHandler(async (_req, res) => {
    res.json(
      await getRepository().listEvents({
        activeAfter: new Date(),
        sort: "asc",
        viewerId: (res.locals as AuthLocals).authUser?.id,
      }),
    );
  }),
);

eventsRouter.get(
  "/mine",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const repository = getRepository();
    const [created, attending] = await Promise.all([
      repository.listEvents({ author: user.id, viewerId: user.id }),
      repository.listEvents({ participant: user.id, viewerId: user.id }),
    ]);
    res.json({ created, attending });
  }),
);

eventsRouter.get(
  "/author/:authorId",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await getRepository().listEvents({
        author: req.params.authorId,
        viewerId: (res.locals as AuthLocals).authUser?.id,
      }),
    );
  }),
);

eventsRouter.get(
  "/participant/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (user.id !== req.params.userId) throw new HttpError(403, "Forbidden");
    res.json(
      await getRepository().listEvents({
        participant: user.id,
        viewerId: user.id,
      }),
    );
  }),
);

eventsRouter.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    let event = await getRepository().getEvent(req.params.id);
    if (!event && config.externalEvents) {
      event =
        findExternalEvent(req.params.id) ??
        (await getExternalEvents()).find((item) => item.id === req.params.id);
    }
    if (!event) throw new HttpError(404, "Event not found");
    const viewerId = (res.locals as AuthLocals).authUser?.id;
    if (!canViewEvent(event, viewerId)) throw new HttpError(404, "Event not found");
    res.json(event);
  }),
);

eventsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = eventCreateSchema.parse(req.body);
    const author = getAuthUser(res.locals as AuthLocals);
    const event: Event = {
      id: newId(),
      title: data.title,
      description: data.description,
      startsAt: new Date(data.startsAt).toISOString(),
      timezone: data.timezone,
      location: data.location,
      category: data.category,
      author: author.name,
      authorId: author.id,
      participants: 1,
      participantIds: [author.id],
      image: data.image,
      tags: data.tags,
      coords: data.coords,
      format: data.format ?? "public",
      createdAt: new Date().toISOString(),
    };
    res.status(201).json(await getRepository().createEvent(event));
  }),
);

eventsRouter.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const repository = getRepository();
    const author = getAuthUser(res.locals as AuthLocals);
    const current = await repository.getEvent(req.params.id);
    if (!current) throw new HttpError(404, "Event not found");
    if (current.authorId !== author.id) {
      throw new HttpError(403, "Only the event author can edit it");
    }
    const event = await repository.updateEvent(req.params.id, eventUpdateSchema.parse(req.body));
    // Участников касается перенос времени, смена места или переименование —
    // правку описания или обложки рассылать незачем (PROD-006).
    if (event) await notifyEventUpdated(current, event, author);
    res.json(event);
  }),
);

eventsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const repository = getRepository();
    const author = getAuthUser(res.locals as AuthLocals);
    const event = await repository.getEvent(req.params.id);
    if (!event) throw new HttpError(404, "Event not found");
    if (event.authorId !== author.id) {
      throw new HttpError(403, "Only the event author can delete it");
    }
    await repository.deleteEvent(event.id);
    // После удаления список участников уже не прочитать — уведомляем по снимку,
    // сделанному до операции.
    await notifyEventCancelled(event, author);
    res.status(204).send();
  }),
);

eventsRouter.post(
  "/:id/join",
  requireAuth,
  asyncHandler(async (req, res) => {
    const repository = getRepository();
    const user = getAuthUser(res.locals as AuthLocals);
    const current = await repository.getEvent(req.params.id);
    if (!current) throw new HttpError(404, "Event not found");
    if (!canViewEvent(current, user.id)) throw new HttpError(403, "Invitation required");
    const alreadyJoined = current.participantIds.includes(user.id);
    const event = await repository.joinEvent(current.id, user.id);
    // Повторное нажатие идемпотентно и не должно рождать второе уведомление.
    if (event && !alreadyJoined) await notifyEventJoined(event, user);
    res.json(event);
  }),
);

eventsRouter.post(
  "/:id/leave",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const event = await getRepository().leaveEvent(req.params.id, user.id);
    if (!event) throw new HttpError(404, "Event not found");
    res.json(event);
  }),
);
