import type { DirectMessage } from "./types.js";
import type { MessageCursor } from "./repositories/repository.js";

/**
 * Личные сообщения: ключ пары и курсор переписки (PROD-011).
 *
 * Логика общая для обоих адаптеров хранилища — иначе они разъехались бы, как
 * это уже случалось с `deleteUser` (BE-004) и со списком друзей, где PostgreSQL
 * считал друзьями и неподтверждённые заявки, а память — нет.
 */

/** Максимум сообщений за один запрос: защита от `?limit=100000`. */
export const MAX_THREAD_LIMIT = 50;
export const DEFAULT_THREAD_LIMIT = 30;

/**
 * Потолок списка диалогов. Курсора у него нет — как и у ленты уведомлений,
 * по той же причине: диалогов у человека десятки, а не тысячи. Цена решения
 * честная: 51-й диалог не покажется, и ошибки при этом не будет.
 */
export const MAX_DIALOGS = 50;

export function normalizeThreadLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_THREAD_LIMIT;
  return Math.min(parsed, MAX_THREAD_LIMIT);
}

/**
 * Канонический ключ пары собеседников.
 *
 * Порядок обязан совпадать с CHECK в миграции 014
 * (`least(...) || ':' || greatest(...)`): разойдутся — вставка начнёт падать на
 * ограничении, причём только в PostgreSQL и только в бою.
 */
export function threadKey(left: string, right: string): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

/**
 * Курсор непрозрачен намеренно: клиенту незачем знать, что внутри, а нам —
 * сохранять формат при изменении сортировки. Base64url, потому что значение
 * едет в query-параметре.
 */
export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Битый курсор — не ошибка запроса: показываем первую страницу. */
export function decodeMessageCursor(value: string | undefined): MessageCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as MessageCursor;
    if (typeof parsed?.id !== "string" || typeof parsed?.createdAt !== "string") return undefined;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return undefined;
  }
}

export function cursorOfMessage(message: DirectMessage): MessageCursor {
  return { createdAt: message.createdAt, id: message.id };
}

/**
 * Порядок переписки: свежие вперёд, при равной метке — по `id`, чтобы порядок
 * был строгим. Кортеж обязан совпадать с `ORDER BY created_at DESC, id DESC` в
 * SQL: разойдутся — сообщения с одинаковой меткой начнут проваливаться между
 * страницами.
 */
export function compareMessages(left: MessageCursor, right: MessageCursor): number {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? 1 : -1;
  // Ноль при равенстве обязателен: иначе сообщение оказывается «идущим после
  // самого себя» и повторяется первым на следующей странице.
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

/** Идёт ли сообщение строго после курсора, то есть глубже в историю. */
export function isAfterMessageCursor(candidate: MessageCursor, cursor: MessageCursor): boolean {
  return compareMessages(cursor, candidate) < 0;
}
