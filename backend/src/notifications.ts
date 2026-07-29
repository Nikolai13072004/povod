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
 * Новое личное сообщение (PROD-011).
 *
 * Единственный тип уведомления без события — поэтому `eventTitle` здесь нет, и
 * ради этого случая колонка стала необязательной (миграция 014). Писать туда
 * суррогат вроде «Личное сообщение» значило бы врать контракту: экран
 * уведомлений показывает название события ссылкой, а открывать здесь нечего.
 *
 * Вызывается только при `firstUnread`: пока предыдущее сообщение не прочитано,
 * второе уведомление не появляется. Иначе активная переписка вытеснит из
 * колокольчика приглашения, отмены и комментарии — то есть всё, что человек не
 * увидит больше нигде.
 */
export async function notifyDirectMessage(recipientId: string, actor: User): Promise<void> {
  if (recipientId === actor.id) return;
  await deliver([
    {
      id: randomUUID(),
      userId: recipientId,
      type: "direct_message",
      actorId: actor.id,
      actorName: actor.name,
      createdAt: new Date().toISOString(),
    },
  ]);
}
