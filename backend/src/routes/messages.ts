import { Router } from "express";
import { getRepository, newId } from "../store.js";
import { asyncHandler, HttpError } from "../middleware.js";
import { getAuthUser, requireAuth, type AuthLocals } from "../auth/middleware.js";
import { createAuthRateLimit } from "../auth/rateLimit.js";
import { presentPublicUser } from "../presenters.js";
import { notifyDirectMessage } from "../notifications.js";
import { messageCreateSchema, messageUpdateSchema } from "../validation.js";
import {
  MAX_DIALOGS,
  cursorOfMessage,
  decodeMessageCursor,
  encodeMessageCursor,
  normalizeThreadLimit,
} from "../directMessages.js";

/**
 * Личные сообщения (PROD-011).
 *
 * Право писать даёт только подтверждённая дружба — это защита от спама и
 * единственная причина, по которой чат вообще можно открыть незнакомому
 * человеку не давая.
 *
 * Все отказы отвечают ОДИНАКОВО. «Нет такого пользователя», «вы не друзья» и
 * «это вы сами» неразличимы снаружи: разделив их, форма превратилась бы в
 * способ перебором выяснять, зарегистрирован ли человек, — ровно та же логика,
 * что у восстановления пароля (SEC-008) и у закрытых событий.
 */

export const messagesRouter = Router();

/*
 * Личная переписка не должна оседать в дисковом кэше браузера: на общем
 * устройстве она переживёт выход из аккаунта и достанется следующему. Service
 * worker её не кэширует (в нём только статика), но обычный HTTP-кэш этим не
 * управляется — заголовок нужен явно, и helmet его не ставит.
 */
messagesRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

/** Один и тот же отказ на все случаи: подробности утекли бы наружу. */
const noDialog = () => new HttpError(404, "Диалог не найден");

/**
 * Отправка ограничена по частоте: переписка — самый дешёвый способ завалить
 * чужой колокольчик и базу. Счётчик живёт в памяти процесса и делится между
 * всеми за одним NAT — грубо, но лучше, чем ничего.
 */
const sendRateLimit = createAuthRateLimit(60, 60_000);

/**
 * Дешёвый счётчик для значка на вкладке: он нужен на каждой странице, а тянуть
 * ради числа полсотни диалогов незачем. Объявлен ПЕРВЫМ намеренно —
 * статический сегмент обязан идти до параметрического, иначе `unread`
 * разберётся как идентификатор сообщения.
 */
messagesRouter.get(
  "/unread",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    res.json({ unread: await getRepository().countUnreadDirectMessages(user.id) });
  }),
);

/** Список диалогов. Без курсора — потолок тот же, что у ленты уведомлений. */
messagesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const repository = getRepository();
    const [dialogs, unread] = await Promise.all([
      repository.listDialogs(user.id, MAX_DIALOGS),
      repository.countUnreadDirectMessages(user.id),
    ]);
    res.json({
      items: dialogs.map((dialog) => ({
        peer: presentPublicUser(dialog.peer),
        lastMessage: dialog.lastMessage,
        unread: dialog.unread,
      })),
      unread,
    });
  }),
);

/**
 * Страница переписки.
 *
 * Доступ к чужому диалогу невозможен структурно: пара считается из
 * идентификатора сессии и параметра, третьего участника у неё не бывает.
 *
 * История переживает расторжение дружбы — написанное не исчезает от того, что
 * дружба кончилась, — но `canSend` при этом становится ложью, и интерфейс
 * заменяет поле ввода объяснением.
 */
messagesRouter.get(
  "/dialog/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const peerId = req.params.userId;
    if (peerId === user.id) throw noDialog();

    const repository = getRepository();
    const peer = await repository.getUser(peerId);
    if (!peer) throw noDialog();

    const canSend = await repository.areFriends(user.id, peerId);
    const limit = normalizeThreadLimit(req.query.limit);
    // Запрашиваем на одну больше, чем отдадим: наличие «лишней» записи и есть
    // признак того, что дальше есть страница (BE-003).
    const page = await repository.listDirectMessages(user.id, peerId, {
      limit: limit + 1,
      cursor: decodeMessageCursor(
        typeof req.query.cursor === "string" ? req.query.cursor : undefined,
      ),
    });

    // Переписки нет и завести её нельзя — значит для этого человека такого
    // диалога не существует, и знать о существовании собеседника ему незачем.
    if (page.length === 0 && !canSend) throw noDialog();

    const items = page.slice(0, limit);
    const last = items[items.length - 1];
    res.json({
      peer: presentPublicUser(peer),
      items,
      nextCursor:
        page.length > limit && last ? encodeMessageCursor(cursorOfMessage(last)) : undefined,
      canSend,
    });
  }),
);

/** Отметить прочитанными входящие от собеседника. Идемпотентно. */
messagesRouter.post(
  "/dialog/:userId/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const peerId = req.params.userId;
    if (peerId === user.id) throw noDialog();
    // Условие зашито в запрос: чужие сообщения прочитанными не пометить даже
    // подставив идентификатор.
    await getRepository().markDirectMessagesRead(user.id, peerId, new Date().toISOString());
    res.status(204).send();
  }),
);

messagesRouter.post(
  "/",
  requireAuth,
  sendRateLimit,
  asyncHandler(async (req, res) => {
    const author = getAuthUser(res.locals as AuthLocals);
    const data = messageCreateSchema.parse(req.body);

    /*
     * Проверка дружбы живёт ВНУТРИ репозитория, в одной транзакции со вставкой.
     * Здесь её делать нельзя: между двумя `await` дружбу успевают расторгнуть,
     * и сообщение уйдёт человеку, который только что закрыл доступ (BE-004).
     */
    const result = await getRepository().sendDirectMessage({
      id: newId(),
      text: data.text,
      senderId: author.id,
      recipientId: data.recipientId,
      createdAt: new Date().toISOString(),
    });
    if (result.outcome === "not-allowed") throw noDialog();

    // Только о первом непрочитанном: серия сообщений иначе вытеснит из
    // колокольчика приглашения, отмены и комментарии.
    if (result.firstUnread) await notifyDirectMessage(data.recipientId, author);
    res.status(201).json(result.message);
  }),
);

/**
 * Правка своего сообщения.
 *
 * Править может только автор — подменять чужие слова, оставляя чужое имя,
 * нельзя (BE-009), — и только пока дружба подтверждена.
 *
 * Второе условие важнее, чем кажется. Правка доставляет НОВЫЙ текст в чужую
 * переписку, то есть делает ровно то же, что отправка. Пока его не было,
 * «убрать из друзей» — единственный доступный человеку рычаг, блокировок в
 * продукте нет — закрывало только `POST`: отправка отвечала 404, а переписать
 * все прежние реплики на что угодно по-прежнему было можно, и текст доезжал
 * до собеседника следующим опросом переписки.
 *
 * Проверка живёт внутри `updateDirectMessage`, вместе с записью. Здесь её
 * ставить нельзя по той же причине, что и у отправки: между двумя `await`
 * дружбу успевают расторгнуть.
 */
messagesRouter.put(
  "/:id",
  requireAuth,
  sendRateLimit,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const { text } = messageUpdateSchema.parse(req.body);
    // Чужое сообщение, несуществующее и «дружбы больше нет» неразличимы:
    // иначе перебором идентификаторов выясняется, что переписка есть.
    const updated = await getRepository().updateDirectMessage(
      req.params.id,
      user.id,
      text,
      new Date().toISOString(),
    );
    if (!updated) throw noDialog();
    res.json(updated);
  }),
);

/**
 * Удаление своего сообщения.
 *
 * Подтверждённая дружба здесь не требуется: убрать собственный текст —
 * действие в пользу приватности, и запрещать его тому, кого отфрендили,
 * значило бы запереть его слова в чужой переписке навсегда.
 */
messagesRouter.delete(
  "/:id",
  requireAuth,
  sendRateLimit,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(res.locals as AuthLocals);
    const removed = await getRepository().deleteDirectMessage(req.params.id, user.id);
    if (!removed) throw noDialog();
    res.status(204).send();
  }),
);
