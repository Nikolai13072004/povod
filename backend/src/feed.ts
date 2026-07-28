import type { Event } from "./types.js";
import type { FeedCursor } from "./repositories/repository.js";

/**
 * Лента: курсор и совпадение с интересами (BE-003, сортировка по интересам).
 *
 * Логика общая для обоих адаптеров хранилища — иначе они разъехались бы, как
 * это уже случалось с `deleteUser` (BE-004).
 */

/** Максимум событий за один запрос: защита от `?limit=100000`. */
export const MAX_FEED_LIMIT = 50;
export const DEFAULT_FEED_LIMIT = 20;

export function normalizeFeedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_FEED_LIMIT;
  return Math.min(parsed, MAX_FEED_LIMIT);
}

/**
 * Курсор непрозрачен намеренно: клиенту незачем знать, что внутри, а нам —
 * сохранять формат при изменении сортировки. Base64url, потому что значение
 * едет в query-параметре.
 */
export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Битый курсор — не ошибка запроса: показываем первую страницу. */
export function decodeCursor(value: string | undefined): FeedCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as FeedCursor;
    if (typeof parsed?.id !== "string" || typeof parsed?.createdAt !== "string") return undefined;
    return { ...parsed, matchesInterests: Boolean(parsed.matchesInterests) };
  } catch {
    return undefined;
  }
}

/** Сравнение без учёта регистра и различия «е/ё» — иначе «Ёлка» не найдёт «елка». */
function normalizeLabel(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
}

/** Совпадает ли событие с интересами зрителя — по категории или тегам. */
export function matchesInterests(event: Event, interests: string[] | undefined): boolean {
  if (!interests?.length) return false;
  const wanted = new Set(interests.map(normalizeLabel));
  return [event.category, ...(event.tags ?? [])]
    .filter((value): value is string => Boolean(value))
    .some((value) => wanted.has(normalizeLabel(value)));
}

export function cursorOf(event: Event, interests: string[] | undefined): FeedCursor {
  return {
    matchesInterests: matchesInterests(event, interests),
    createdAt: event.createdAt,
    id: event.id,
  };
}

/**
 * Порядок ленты: сначала подходящие по интересам, внутри группы — свежие
 * вперёд, при равной дате — по `id`, чтобы порядок был строгим.
 */
export function compareFeed(left: FeedCursor, right: FeedCursor): number {
  if (left.matchesInterests !== right.matchesInterests) return left.matchesInterests ? -1 : 1;
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? 1 : -1;
  // Ноль при равенстве обязателен: иначе событие оказывается «идущим после
  // самого себя» и повторяется первым на следующей странице.
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

/** Идёт ли событие строго после курсора в порядке ленты. */
export function isAfterCursor(candidate: FeedCursor, cursor: FeedCursor): boolean {
  return compareFeed(cursor, candidate) < 0;
}
