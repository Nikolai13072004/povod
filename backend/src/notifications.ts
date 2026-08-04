import { randomUUID } from "node:crypto";
import { getRepository } from "./store.js";
import { logger } from "./logger.js";
import type { Event, Notification, NotificationType, User } from "./types.js";

/**
 * Порождение уведомлений (PROD-003).
 *
 * Раньше колокольчик в шапке вёл на экран с пустым массивом: источника данных
 * не было вообще. Здесь собирается всё, что приложение реально умеет заметить.
 *
 * Два правила, общих для всех уведомлений:
 *
 *  1. Автор действия себе не пишет. Иначе лента превращается в отчёт о
 *     собственных нажатиях и перестаёт нести информацию.
 *  2. Название события и имя участника копируются в само уведомление. Событие
 *     могут удалить, пользователя — тоже, а весть «событие отменено» обязана
 *     пережить именно удаление события, иначе исчезнет в самый нужный момент.
 */

/** Сколько уведомлений отдаётся в ленту: экран всё равно не показывает больше. */
export const NOTIFICATION_FEED_LIMIT = 50;

function buildNotification(
  userId: string,
  type: NotificationType,
  event: Event,
  actor: User,
  changes?: string[],
  /** Ссылку на событие можно опустить — см. `notifyEventCancelled`. */
  linkToEvent = true,
): Notification {
  return {
    id: randomUUID(),
    userId,
    type,
    eventId: linkToEvent ? event.id : undefined,
    eventTitle: event.title,
    actorId: actor.id,
    actorName: actor.name,
    changes,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Пишет уведомления, но никогда не роняет из-за них основное действие.
 *
 * Запись на событие, комментарий и правка — это то, ради чего пришёл
 * пользователь; уведомление другим — побочный эффект. Ошибка побочного эффекта
 * не должна оборачиваться ошибкой запроса и потерей уже сделанной работы.
 */
async function deliver(notifications: Notification[]): Promise<void> {
  if (notifications.length === 0) return;
  try {
    await getRepository().createNotifications(notifications);
  } catch (error) {
    logger.error("[notifications] не удалось записать уведомления:", error);
  }
}

/** Значимые для участника поля события. Правку описания или обложки не рассылаем. */
function describeChanges(before: Event, after: Event): string[] {
  const changes: string[] = [];
  if (before.startsAt !== after.startsAt) changes.push("время");
  if (before.location !== after.location) changes.push("место");
  if (before.title !== after.title) changes.push("название");
  return changes;
}

export async function notifyEventUpdated(
  before: Event,
  after: Event,
  actor: User,
): Promise<string[]> {
  const changes = describeChanges(before, after);
  if (changes.length === 0) return [];
  const recipients = after.participantIds.filter((id) => id !== actor.id);
  await deliver(
    recipients.map((userId) => buildNotification(userId, "event_updated", after, actor, changes)),
  );
  return changes;
}

/**
 * Об отмене узнают по снимку, сделанному до удаления: после него список
 * участников уже не прочитать.
 *
 * Ссылка на событие намеренно не сохраняется. Открывать нечего — записи больше
 * нет, а в PostgreSQL внешний ключ такую вставку просто отклонил бы, и тогда
 * участники не узнали бы об отмене вовсе. Название при этом остаётся: без него
 * уведомление превратилось бы в «что-то отменено».
 */
export async function notifyEventCancelled(event: Event, actor: User): Promise<void> {
  const recipients = event.participantIds.filter((id) => id !== actor.id);
  await deliver(
    recipients.map((userId) =>
      buildNotification(userId, "event_cancelled", event, actor, undefined, false),
    ),
  );
}

export async function notifyEventComment(event: Event, actor: User): Promise<void> {
  if (event.authorId === actor.id) return;
  await deliver([buildNotification(event.authorId, "event_comment", event, actor)]);
}

export async function notifyEventJoined(event: Event, actor: User): Promise<void> {
  if (event.authorId === actor.id) return;
  await deliver([buildNotification(event.authorId, "event_joined", event, actor)]);
}

/**
 * Приглашение заглянуть в чат события — тому, кто только что записался (PROD-013).
 *
 * По желанию, но не молча: в чате бывает важное — сбор, изменения, детали, — и
 * человек, не знающий о комнате, их пропустит. Автору звать некого: свою комнату
 * он и так видит. Выключенный чат приглашения не порождает — звать некуда.
 *
 * Actor'а у этого уведомления нет: оно о самом событии, а не о чьём-то действии.
 * Ради этого случая `event_title` в схеме давно необязательна (миграция 014), а
 * `actorId`/`actorName` опциональны в контракте.
 */
export async function notifyEventChatAvailable(event: Event, participant: User): Promise<void> {
  if (!event.chatEnabled || event.authorId === participant.id) return;
  await deliver([
    {
      id: randomUUID(),
      userId: participant.id,
      type: "event_chat",
      eventId: event.id,
      eventTitle: event.title,
      createdAt: new Date().toISOString(),
    },
  ]);
}

/**
 * Новое личное сообщение (PROD-011).
 *
 * Вызывается только при `firstUnread`: пока предыдущее сообщение не прочитано,
 * второе уведомление не появляется. Иначе активная переписка вытеснит из
 * колокольчика приглашения, отмены и комментарии — то есть всё, что человек не
 * увидит больше нигде.
 */
export async function notifyDirectMessage(recipientId: string, actor: User): Promise<void> {
  if (recipientId === actor.id) return;
  await deliver([personalNotification(recipientId, "direct_message", actor)]);
}

/**
 * Уведомления о дружбе (SEC-015).
 *
 * Заявка приходила молча: узнать о ней можно было, только зайдя в профиль и
 * увидев блок «Заявки». Колокольчик не загорался, потому что уведомления не
 * порождалось вовсе, — а именно им приложение сообщает обо всём остальном.
 *
 * Уведомление о принятии не менее важно: без него отправивший заявку не узнаёт
 * об ответе никак и вынужден заходить в чужой профиль и проверять кнопку.
 */
export async function notifyFriendRequest(recipientId: string, actor: User): Promise<void> {
  if (recipientId === actor.id) return;
  await deliver([personalNotification(recipientId, "friend_request", actor)]);
}

export async function notifyFriendAccepted(recipientId: string, actor: User): Promise<void> {
  if (recipientId === actor.id) return;
  await deliver([personalNotification(recipientId, "friend_accepted", actor)]);
}

/**
 * Гашение уведомления по факту выполненного действия (UX-019).
 *
 * Уведомление — это «есть незакрытое дело». Когда дело закрыто в другом месте
 * приложения (сообщение прочитано в самой переписке, заявка принята или
 * отклонена в профиле), уведомление о нём обязано погаснуть само — иначе
 * колокольчик держит непрочитанным то, что уже сделано, и человек ищет призрак.
 *
 * Как и `deliver`, это побочный эффект: его ошибка не должна ронять основное
 * действие (пометку прочтения, ответ на заявку), ради которого пришёл человек.
 */
async function resolve(userId: string, actorId: string, types: NotificationType[]): Promise<void> {
  try {
    await getRepository().markNotificationsReadByActor(
      userId,
      actorId,
      types,
      new Date().toISOString(),
    );
  } catch (error) {
    logger.error("[notifications] не удалось погасить уведомления:", error);
  }
}

/** Прочитал переписку — гасим уведомления о личных сообщениях от собеседника. */
export async function resolveDirectMessageNotifications(
  userId: string,
  peerId: string,
): Promise<void> {
  await resolve(userId, peerId, ["direct_message"]);
}

/** Ответил на заявку (принял или отклонил) — гасим уведомление о ней. */
export async function resolveFriendRequestNotification(
  userId: string,
  requesterId: string,
): Promise<void> {
  await resolve(userId, requesterId, ["friend_request"]);
}

/**
 * Уведомление без события: у сообщений и дружбы его нет, и `eventTitle` здесь
 * отсутствует — ради этого случая колонка стала необязательной (миграция 014).
 * Писать туда суррогат значило бы врать контракту: экран показывает название
 * ссылкой на событие, а открывать здесь нечего, кроме человека.
 */
function personalNotification(userId: string, type: NotificationType, actor: User): Notification {
  return {
    id: randomUUID(),
    userId,
    type,
    actorId: actor.id,
    actorName: actor.name,
    createdAt: new Date().toISOString(),
  };
}
