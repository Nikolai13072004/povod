import { Router } from "express";
import { getRepository, newId } from "../store.js";
import { asyncHandler, HttpError } from "../middleware.js";
import { getAuthUser, requireAuth, type AuthLocals } from "../auth/middleware.js";
import { createAuthRateLimit } from "../auth/rateLimit.js";
import { eventMessageCreateSchema } from "../validation.js";
import { cursorOfMessage, decodeMessageCursor, encodeMessageCursor } from "../directMessages.js";
import { normalizeEventChatLimit } from "../eventChat.js";

/**
 * Чат участников события (PROD-013).
 *
 * Групповая переписка тех, кто идёт на событие. Право в ней — производная от
 * участия: отдельной «комнаты», куда вступают, нет, есть флаг чата у события и
 * список его участников. Всё это проверяется внутри репозитория, в одной
 * транзакции с записью, — как у личных сообщений.
 *
 * Отказ всегда один — 404. «События нет», «чат выключен» и «вы не участник»
 * снаружи неразличимы: разные ответы дали бы способ перебором выяснять, что
 * закрытая комната существует. Роутер физически не может ответить по-разному —
 * репозиторий возвращает ему `undefined`/`not-allowed` без подробностей.
 *
 * Смонтирован на `/:id/chat` внутри `eventsRouter`, поэтому `mergeParams`: id
 * события приходит из родительского маршрута.
 */
export const eventChatRouter = Router({ mergeParams: true });

/** Переписка не должна оседать в дисковом кэше браузера (как у личных сообщений). */
eventChatRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const noChat = () => new HttpError(404, "Чат недоступен");

/** Тот же лимит частоты, что у личных сообщений: чат — дешёвый способ спама. */
const sendRateLimit = createAuthRateLimit(60, 60_000);

/** Страница чата: свежие сообщения первыми, курсор листает вглубь истории. */
eventChatRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const eventId = req.params.id;
    const repository = getRepository();
    const limit = normalizeEventChatLimit(req.query.limit);
    // На одну больше, чем отдадим: «лишняя» запись — признак следующей страницы.
    const page = await repository.listEventMessages(eventId, user.id, {
      limit: limit + 1,
      cursor: decodeMessageCursor(
        typeof req.query.cursor === "string" ? req.query.cursor : undefined,
      ),
    });
    if (!page) throw noChat();

    // Название нужно экрану чата в шапке. Событие заведомо доступно: комнату
    // репозиторий уже открыл, — но проверка на undefined обязательна, иначе TS
    // не отличит «нет события» от «есть».
    const event = await repository.getEvent(eventId);
    const items = page.slice(0, limit);
    const last = items[items.length - 1];
    res.json({
      eventId,
      eventTitle: event?.title ?? "",
      items,
      nextCursor:
        page.length > limit && last ? encodeMessageCursor(cursorOfMessage(last)) : undefined,
    });
  }),
);

/** Отправка в чат. Право писать проверяет репозиторий — в транзакции со вставкой. */
eventChatRouter.post(
  "/",
  requireAuth,
  sendRateLimit,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const eventId = req.params.id;
    const { text } = eventMessageCreateSchema.parse(req.body);
    const result = await getRepository().sendEventMessage({
      id: newId(),
      eventId,
      senderId: user.id,
      text,
      createdAt: new Date().toISOString(),
    });
    if (result.outcome === "not-allowed") throw noChat();
    res.status(201).json(result.message);
  }),
);

/**
 * Удаление реплики: свою убирает её автор, автор события — любую (модерация
 * своей комнаты, как удаление комментариев). Переписать чужой текст нельзя
 * никому — это подмена чужих слов под чужим именем.
 */
eventChatRouter.delete(
  "/:messageId",
  requireAuth,
  sendRateLimit,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const removed = await getRepository().deleteEventMessage(
      req.params.id,
      req.params.messageId,
      user.id,
    );
    if (!removed) throw noChat();
    res.status(204).send();
  }),
);
