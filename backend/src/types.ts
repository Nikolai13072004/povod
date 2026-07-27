/**
 * Доменные модели POVOD: Event, User, Comment.
 * Совместимы с типами фронтенда (`frontend/src/services/api.ts`).
 * Поля сверх контракта (authorId, participantIds, category, format...) —
 * безопасное расширение: фронт их просто игнорирует.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  /** Город пользователя (BE-010). */
  city?: string;
  interests?: string[];
  /** id-шники друзей */
  friends?: string[];
  createdAt: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  /** ISO 8601 instant, e.g. "2026-06-27T15:00:00.000Z". */
  startsAt: string;
  /** IANA timezone used for local presentation, e.g. "Europe/Moscow". */
  timezone: string;
  location: string;
  category?: string;
  /** Отображаемое имя автора (контракт фронта: author: string) */
  author: string;
  authorId: string;
  /** Кол-во участников */
  participants: number;
  /** id-шники участников */
  participantIds: string[];
  image?: string;
  tags?: string[];
  /** Координаты места [lat, lng] — для карты на детальной странице */
  coords?: [number, number];
  format?: "public" | "private";
  createdAt: string;
}

export interface Comment {
  id: string;
  text: string;
  author: User;
  createdAt: string;
  eventId: string;
}

/**
 * Что произошло. Набор намеренно узкий: только события, которые приложение
 * действительно умеет порождать сегодня.
 */
export type NotificationType =
  /** Организатор изменил время или место события, на которое вы записаны. */
  | "event_updated"
  /** Событие, на которое вы записаны, отменено. */
  | "event_cancelled"
  /** Новый комментарий к вашему событию. */
  | "event_comment"
  /** Кто-то записался на ваше событие. */
  | "event_joined";

export interface Notification {
  id: string;
  /** Получатель. */
  userId: string;
  type: NotificationType;
  /**
   * Событие. Может отсутствовать: уведомление об отмене обязано пережить
   * само событие, иначе оно исчезнет ровно тогда, когда нужнее всего.
   */
  eventId?: string;
  /** Название сохраняется рядом по той же причине — прочитать его будет уже негде. */
  eventTitle: string;
  actorId?: string;
  actorName?: string;
  /** Человекочитаемый список изменений — для `event_updated` («время», «место»). */
  changes?: string[];
  createdAt: string;
  readAt?: string;
}
