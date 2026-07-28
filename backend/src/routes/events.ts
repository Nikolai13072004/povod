import { Router } from "express";
import { getRepository, newId } from "../store";
import { asyncHandler, HttpError } from "../middleware";
import { eventCreateSchema, eventUpdateSchema, invitationCreateSchema } from "../validation";
import { config } from "../config";
import { getExternalEvents, findExternalEvent } from "../kudago";
import type { Event } from "../types";
import { getAuthUser, optionalAuth, requireAuth, type AuthLocals } from "../auth/middleware";
import { notifyEventCancelled, notifyEventJoined, notifyEventUpdated } from "../notifications";
import { issueInvitation, presentInvitation, resolveInvitation } from "../invitations";

export const eventsRouter = Router();

/**
 * Секрет приглашения приходит query-параметром `invite`: так его несёт обычная
 * ссылка, которую можно переслать в мессенджере.
 */
function inviteToken(req: { query: Record<string, unknown> }): string | undefined {
  const value = req.query.invite;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

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

// Объявлено до «/:id», иначе слово favorites было бы разобрано как идентификатор.
eventsRouter.get(
  "/favorites",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    // viewerId тот же: если открытое событие позже стало приватным, оно уйдёт
    // из избранного само, без отдельной чистки.
    res.json(await getRepository().listEvents({ favoritedBy: user.id, viewerId: user.id }));
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
    if (!canViewEvent(event, viewerId)) {
      // Ссылка-приглашение открывает ровно одно закрытое событие — то, для
      // которого выдана (BE-008).
      const invitation = await resolveInvitation(inviteToken(req), event.id);
      if (!invitation) throw new HttpError(404, "Event not found");
    }
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
      endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : undefined,
      participantLimit: data.participantLimit,
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
    const patch = eventUpdateSchema.parse(req.body);

    // Пару «начало — окончание» сверяем с итоговым видом события: перенос
    // только начала мог бы оставить окончание в прошлом относительно него.
    const startsAt = patch.startsAt ?? current.startsAt;
    const endsAt = patch.endsAt ?? current.endsAt;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new HttpError(400, "Окончание должно быть позже начала");
    }

    // Лимит ниже числа уже записавшихся означал бы «мест −2»: отказываем прямо,
    // а не оставляем событие в состоянии, которое интерфейс не умеет показать.
    if (patch.participantLimit !== undefined && patch.participantLimit < current.participants) {
      throw new HttpError(
        400,
        `На событие уже записаны ${current.participants} — лимит не может быть меньше`,
      );
    }

    const event = await repository.updateEvent(req.params.id, patch);
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

    const invitation = await resolveInvitation(inviteToken(req), current.id);
    if (!canViewEvent(current, user.id) && !invitation) {
      throw new HttpError(403, "Invitation required");
    }

    const result = await repository.joinEvent(current.id, user.id);
    switch (result.outcome) {
      case "not-found":
        throw new HttpError(404, "Event not found");
      case "full":
        // 409, а не 403: дело не в правах — место заняли раньше.
        throw new HttpError(409, "Свободных мест не осталось");
      case "already-joined":
        // Повторное нажатие идемпотентно и не рождает второго уведомления.
        res.json(result.event);
        return;
      case "joined":
        // Приглашение считается использованным только при записи: перечитывание
        // страницы не должно исчерпывать ссылку, рассчитанную на пять человек.
        if (invitation) await repository.consumeInvitation(invitation.id);
        await notifyEventJoined(result.event, user);
        res.json(result.event);
    }
  }),
);

/** Автор закрытого события выдаёт ссылку-приглашение (BE-008). */
eventsRouter.post(
  "/:id/invitations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const event = await getRepository().getEvent(req.params.id);
    if (!event || !canViewEvent(event, user.id)) throw new HttpError(404, "Event not found");
    if (event.authorId !== user.id) {
      throw new HttpError(403, "Only the event author can invite");
    }
    const options = invitationCreateSchema.parse(req.body ?? {});
    const { token, invitation } = await issueInvitation(event, user, options);
    // Секрет виден ровно один раз — в этом ответе. Дальше в базе только его хэш.
    res.status(201).json({ ...presentInvitation(invitation), token });
  }),
);

eventsRouter.get(
  "/:id/invitations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const event = await getRepository().getEvent(req.params.id);
    if (!event || !canViewEvent(event, user.id)) throw new HttpError(404, "Event not found");
    if (event.authorId !== user.id) {
      throw new HttpError(403, "Only the event author can list invitations");
    }
    res.json((await getRepository().listInvitations(event.id)).map(presentInvitation));
  }),
);

eventsRouter.delete(
  "/:id/invitations/:invitationId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const event = await getRepository().getEvent(req.params.id);
    if (!event || !canViewEvent(event, user.id)) throw new HttpError(404, "Event not found");
    if (event.authorId !== user.id) {
      throw new HttpError(403, "Only the event author can revoke invitations");
    }
    const revoked = (await getRepository().listInvitations(event.id)).find(
      (item) => item.id === req.params.invitationId,
    );
    if (!revoked) throw new HttpError(404, "Invitation not found");
    await getRepository().revokeInvitation(revoked.id, new Date().toISOString());
    res.status(204).send();
  }),
);

/**
 * Избранное идемпотентно: повторное нажатие возвращает тот же 204, а не ошибку.
 * Интерфейс не обязан знать текущее состояние отметки, чтобы её выставить.
 */
eventsRouter.post(
  "/:id/favorite",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const event = await getRepository().getEvent(req.params.id);
    // Приватное чужое событие не должно даже подтверждать своё существование.
    if (!event || !canViewEvent(event, user.id)) throw new HttpError(404, "Event not found");
    await getRepository().addFavorite(user.id, event.id);
    res.status(204).send();
  }),
);

eventsRouter.delete(
  "/:id/favorite",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    if (!(await getRepository().removeFavorite(user.id, req.params.id))) {
      throw new HttpError(404, "Event not found");
    }
    res.status(204).send();
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
