import type { Event } from "./types.js";

/**
 * Чат события: правила, общие для обоих адаптеров хранилища (PROD-013).
 *
 * Курсор и порядок сообщений у чата те же, что у личной переписки, — модуль
 * `directMessages.ts` (encodeMessageCursor, compareMessages и далее) применим
 * как есть: сообщение чата несёт ту же пару (createdAt, id).
 *
 * Здесь живёт только своё: право находиться в комнате. Оно выводится из
 * УЧАСТИЯ в событии, а не хранится отдельно — вторая таблица членства
 * разъезжалась бы со списком участников молча (см. миграцию 016).
 */

/** Максимум сообщений за запрос — как у переписки: защита от `?limit=100000`. */
export const MAX_EVENT_CHAT_LIMIT = 50;
export const DEFAULT_EVENT_CHAT_LIMIT = 30;

export function normalizeEventChatLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_EVENT_CHAT_LIMIT;
  return Math.min(parsed, MAX_EVENT_CHAT_LIMIT);
}

/**
 * Может ли человек находиться в чате события.
 *
 * Автор — всегда участник комнаты, даже если его нет в `participantIds`
 * (создатель не «записывается» на собственное событие). Выключенный чат
 * закрыт для всех, включая автора: полуоткрытая комната, где автор пишет в
 * пустоту, выглядела бы как работающая.
 */
export function canUseEventChat(event: Event, userId: string): boolean {
  if (!event.chatEnabled) return false;
  return event.authorId === userId || event.participantIds.includes(userId);
}
