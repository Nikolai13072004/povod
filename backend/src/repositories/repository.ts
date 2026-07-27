import type { Comment, Event, Notification, User } from "../types";

export interface EventFilters {
  search?: string;
  category?: string;
  author?: string;
  participant?: string;
  viewerId?: string;
  startsFrom?: Date;
  startsTo?: Date;
  activeAfter?: Date;
  sort?: "asc" | "desc";
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
  joinEvent(eventId: string, userId: string): Promise<Event | undefined>;
  leaveEvent(eventId: string, userId: string): Promise<Event | undefined>;

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
  getExternalIdentity(
    provider: string,
    externalUserId: string,
  ): Promise<ExternalIdentity | undefined>;
  linkExternalIdentity(identity: ExternalIdentity): Promise<void>;
}
