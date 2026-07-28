import type { Comment, Event, EventInvitation, Notification, User } from "../types.js";

/**
 * Исход попытки записаться (BE-007).
 *
 * Прежняя сигнатура `Event | undefined` различала только «получилось» и
 * «события нет». С лимитом появились ещё два случая, и сваливать их в
 * `undefined` значило бы отвечать «событие не найдено» тому, кто просто не
 * успел занять последнее место.
 */
export type JoinEventResult =
  | { outcome: "joined"; event: Event }
  /** Уже был участником: повторное нажатие идемпотентно. */
  | { outcome: "already-joined"; event: Event }
  | { outcome: "full"; event: Event }
  | { outcome: "not-found" };

export interface EventFilters {
  search?: string;
  category?: string;
  author?: string;
  participant?: string;
  /** Только события, добавленные этим пользователем в избранное (PROD-001). */
  favoritedBy?: string;
  viewerId?: string;
  /**
   * Интересы зрителя: подходящие события идут первыми, остальные — следом
   * (сортировка по интересам вместо полноценных рекомендаций).
   */
  preferInterests?: string[];
  /** Сколько событий вернуть; вместе с `cursor` даёт постраничную выдачу (BE-003). */
  limit?: number;
  /** Позиция, после которой продолжать. Разбирается из непрозрачной строки. */
  cursor?: FeedCursor;
  startsFrom?: Date;
  startsTo?: Date;
  activeAfter?: Date;
  sort?: "asc" | "desc";
}

/**
 * Позиция в ленте (BE-003).
 *
 * Курсор, а не номер страницы: пока пользователь листает, кто-то создаёт новые
 * события, и смещение `OFFSET` начинает пропускать или дублировать записи.
 * Ключ — тройка из полей сортировки, включая `id`: одной даты мало, у нескольких
 * событий она совпадает с точностью до микросекунды.
 */
export interface FeedCursor {
  /** Совпало ли событие с интересами зрителя: ведущее поле при такой сортировке. */
  matchesInterests: boolean;
  createdAt: string;
  id: string;
}

export interface CreateCommentInput {
  id: string;
  text: string;
  eventId: string;
  authorId: string;
  createdAt: string;
}

export interface AuthSession {
  id: string;
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt?: string;
}

/** Одноразовый токен смены пароля (SEC-008). В хранилище — только его SHA-256. */
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

export interface ExternalIdentity {
  provider: string;
  externalUserId: string;
  userId: string;
  profile?: Record<string, unknown>;
}

export interface PovodRepository {
  init(): Promise<void>;
  /** Проверка готовности хранилища (для readiness-пробы). Бросает/возвращает false, если недоступно. */
  ping(): Promise<boolean>;

  listEvents(filters?: EventFilters): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  createEvent(event: Event): Promise<Event>;
  updateEvent(id: string, patch: Partial<Event>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;
  /** Запись на событие. Проверка лимита обязана быть атомарной (BE-007). */
  joinEvent(eventId: string, userId: string): Promise<JoinEventResult>;
  leaveEvent(eventId: string, userId: string): Promise<Event | undefined>;

  /** Создаёт приглашение в закрытое событие; наружу секрет отдаёт вызывающий (BE-008). */
  createInvitation(invitation: EventInvitation): Promise<void>;
  /** Находит действующее приглашение по хэшу секрета. */
  findInvitationByTokenHash(tokenHash: string): Promise<EventInvitation | undefined>;
  /** Считает переход по приглашению; `false` — приглашение исчерпано или отозвано. */
  consumeInvitation(id: string): Promise<boolean>;
  listInvitations(eventId: string): Promise<EventInvitation[]>;
  revokeInvitation(id: string, revokedAt: string): Promise<boolean>;

  /**
   * Добавляет событие в избранное. Идемпотентно: повторный вызов не ошибка.
   * `false` — события не существует.
   */
  addFavorite(userId: string, eventId: string): Promise<boolean>;
  /** Убирает из избранного. Идемпотентно: `false` только если события нет. */
  removeFavorite(userId: string, eventId: string): Promise<boolean>;

  listUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: User): Promise<User>;
  createPasswordUser(user: User, passwordHash: string): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  listFriends(userId: string): Promise<User[] | undefined>;
  addFriend(userId: string, friendId: string): Promise<User | undefined>;
  removeFriend(userId: string, friendId: string): Promise<boolean | undefined>;

  listComments(eventId: string): Promise<Comment[]>;
  getComment(id: string): Promise<Comment | undefined>;
  createComment(input: CreateCommentInput): Promise<Comment>;
  deleteComment(id: string): Promise<boolean>;

  /** Пишет пачку уведомлений одним вызовом: одно действие обычно касается многих. */
  createNotifications(notifications: Notification[]): Promise<void>;
  listNotifications(userId: string, limit: number): Promise<Notification[]>;
  countUnreadNotifications(userId: string): Promise<number>;
  /** Отмечает прочитанными указанные уведомления пользователя (все, если `ids` не задан). */
  markNotificationsRead(userId: string, readAt: string, ids?: string[]): Promise<number>;

  getPasswordHash(userId: string): Promise<string | undefined>;
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
  createSession(session: AuthSession): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined>;
  touchSession(id: string, usedAt: string): Promise<void>;
  revokeSession(id: string): Promise<void>;
  /** Удаляет истёкшие и отозванные сессии; возвращает число удалённых (SEC-007). */
  deleteExpiredSessions(now: string): Promise<number>;
  /** Отзывает все сессии пользователя; возвращает число отозванных (SEC-008). */
  revokeUserSessions(userId: string, revokedAt: string): Promise<number>;

  createPasswordResetToken(token: PasswordResetToken): Promise<void>;
  getPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | undefined>;
  /** Помечает токен использованным; `false` — им уже воспользовались. */
  consumePasswordResetToken(id: string, usedAt: string): Promise<boolean>;
  /** Чистит просроченные и использованные токены; возвращает число удалённых. */
  deleteExpiredPasswordResetTokens(now: string): Promise<number>;
  getExternalIdentity(
    provider: string,
    externalUserId: string,
  ): Promise<ExternalIdentity | undefined>;
  linkExternalIdentity(identity: ExternalIdentity): Promise<void>;
}
