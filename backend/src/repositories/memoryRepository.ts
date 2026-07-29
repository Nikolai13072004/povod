import fs from "node:fs";
import path from "node:path";
import type {
  Comment,
  Dialog,
  DirectMessage,
  Event,
  EventInvitation,
  Notification,
  User,
} from "../types.js";
import type {
  AuthSession,
  CreateCommentInput,
  CreateMessageInput,
  EventFilters,
  ExternalIdentity,
  FriendRequests,
  FriendshipOutcome,
  JoinEventResult,
  MessageThreadFilters,
  PasswordResetToken,
  PovodRepository,
  SendMessageResult,
} from "./repository.js";
import { seedComments, seedEvents, seedUsers } from "../seed.js";
import { compareFeed, cursorOf, isAfterCursor } from "../feed.js";
import {
  compareMessages,
  cursorOfMessage,
  isAfterMessageCursor,
  threadKey,
} from "../directMessages.js";
import { eventDateToIso } from "../db/eventDate.js";
import { logger } from "../logger.js";

type LegacyEvent = Omit<Event, "startsAt" | "timezone"> & {
  date: string;
  time?: string;
};

interface Snapshot {
  users: User[];
  events: Event[];
  comments: Comment[];
  notifications?: Notification[];
  messages?: DirectMessage[];
  favorites?: Array<[string, string[]]>;
  invitations?: EventInvitation[];
  passwordCredentials?: Array<[string, string]>;
  sessions?: AuthSession[];
  externalIdentities?: ExternalIdentity[];
}

const clone = <T>(value: T): T => structuredClone(value);

/** Регистр и «ё» не должны мешать поиску: «Ёлка» обязана находиться по «елка». */
function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е");
}

function canonicalFriendship(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

export class MemoryRepository implements PovodRepository {
  private users: User[] = clone(seedUsers);
  private events: Event[] = clone(seedEvents);
  private comments: Comment[] = clone(seedComments);
  private notifications: Notification[] = [];
  /** Личные сообщения (PROD-011). Диалог — производная от пары собеседников. */
  private messages: DirectMessage[] = [];
  /** Избранное: пользователь → идентификаторы событий (PROD-001). */
  private favorites = new Map<string, Set<string>>();
  private invitations: EventInvitation[] = [];
  /** Заявки, ждущие ответа. Принятые дружбы живут в `user.friends` (SEC-012). */
  private friendRequests: { from: string; to: string; createdAt: string }[] = [];
  private passwordResetTokens: PasswordResetToken[] = [];
  private passwordCredentials = new Map<string, string>();
  private sessions = new Map<string, AuthSession>();
  private externalIdentities = new Map<string, ExternalIdentity>();
  private readonly persistFile?: string;
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(persistFile?: string) {
    this.persistFile = persistFile;
    this.normalizeRelations();
  }

  async ping(): Promise<boolean> {
    // In-memory/JSON-хранилище всегда доступно после инициализации процесса.
    return true;
  }

  async init(): Promise<void> {
    if (!this.persistFile || !fs.existsSync(this.persistFile)) return;
    try {
      const snapshot = JSON.parse(fs.readFileSync(this.persistFile, "utf8")) as Partial<Snapshot>;
      this.users = clone(snapshot.users ?? []);
      this.events = clone(snapshot.events ?? []);
      this.comments = clone(snapshot.comments ?? []);
      this.notifications = clone(snapshot.notifications ?? []);
      this.messages = clone(snapshot.messages ?? []);
      this.favorites = new Map(
        (snapshot.favorites ?? []).map(([userId, eventIds]) => [userId, new Set(eventIds)]),
      );
      this.invitations = clone(snapshot.invitations ?? []);
      this.passwordCredentials = new Map(snapshot.passwordCredentials ?? []);
      this.sessions = new Map(
        (snapshot.sessions ?? []).map((session) => [session.tokenHash, session]),
      );
      this.externalIdentities = new Map(
        (snapshot.externalIdentities ?? []).map((identity) => [
          this.identityKey(identity.provider, identity.externalUserId),
          identity,
        ]),
      );
      this.normalizeRelations();
      logger.info(`[store] данные загружены из ${this.persistFile}`);
    } catch (error) {
      logger.warn("[store] локальный снимок повреждён, используются seed-данные:", error);
    }
  }

  async listEvents(filters: EventFilters = {}): Promise<Event[]> {
    let items = this.events;
    if (filters.search) {
      // Приближение полнотекстового поиска PostgreSQL (BE-012): там работает
      // стемминг русского, здесь — совпадение по началу слова. Этого хватает,
      // чтобы поведение in-memory адаптера не удивляло на тех же данных.
      const words = normalizeSearch(filters.search).split(/\s+/).filter(Boolean);
      items = items.filter((event) => {
        const haystack = normalizeSearch(
          [event.title, event.location, event.category, event.description, ...(event.tags ?? [])]
            .filter(Boolean)
            .join(" "),
        );
        return words.every((word) =>
          haystack.split(/[^\p{L}\p{N}]+/u).some((token) => token.startsWith(word)),
        );
      });
    }
    if (filters.category) {
      items = items.filter(
        (event) =>
          (event.category ?? "").toLocaleLowerCase("ru") ===
          filters.category?.toLocaleLowerCase("ru"),
      );
    }
    if (filters.author) {
      items = items.filter(
        (event) => event.authorId === filters.author || event.author === filters.author,
      );
    }
    if (filters.participant) {
      items = items.filter((event) => event.participantIds.includes(filters.participant!));
    }
    if (filters.favoritedBy) {
      const favorites = this.favorites.get(filters.favoritedBy);
      items = favorites ? items.filter((event) => favorites.has(event.id)) : [];
    }
    items = items.filter(
      (event) =>
        event.format !== "private" ||
        event.authorId === filters.viewerId ||
        Boolean(filters.viewerId && event.participantIds.includes(filters.viewerId)),
    );
    const startsFrom = filters.startsFrom ?? filters.activeAfter;
    if (startsFrom) {
      items = items.filter((event) => Date.parse(event.startsAt) >= startsFrom.getTime());
    }
    if (filters.startsTo) {
      items = items.filter((event) => Date.parse(event.startsAt) < filters.startsTo!.getTime());
    }
    if (filters.sort) {
      const direction = filters.sort === "asc" ? 1 : -1;
      items = [...items].sort(
        (left, right) => direction * (Date.parse(left.startsAt) - Date.parse(right.startsAt)),
      );
    } else if (filters.preferInterests?.length || filters.limit !== undefined) {
      // Порядок ленты строгий (интересы → свежесть → id): без этого одна и та
      // же запись могла бы попасть на две страницы подряд.
      items = [...items].sort((left, right) =>
        compareFeed(
          cursorOf(left, filters.preferInterests),
          cursorOf(right, filters.preferInterests),
        ),
      );
    }

    if (filters.cursor) {
      const cursor = filters.cursor;
      items = items.filter((event) =>
        isAfterCursor(cursorOf(event, filters.preferInterests), cursor),
      );
    }
    if (filters.limit !== undefined) items = items.slice(0, filters.limit);

    return clone(items);
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const event = this.events.find((item) => item.id === id);
    return event ? clone(event) : undefined;
  }

  async createEvent(event: Event): Promise<Event> {
    this.events.unshift(clone(event));
    this.scheduleSave();
    return clone(event);
  }

  async updateEvent(id: string, patch: Partial<Event>): Promise<Event | undefined> {
    const event = this.events.find((item) => item.id === id);
    if (!event) return undefined;
    Object.assign(event, clone(patch), { id: event.id });
    event.participants = event.participantIds.length;
    this.scheduleSave();
    return clone(event);
  }

  async deleteEvent(id: string): Promise<boolean> {
    const before = this.events.length;
    this.events = this.events.filter((event) => event.id !== id);
    if (this.events.length === before) return false;
    this.comments = this.comments.filter((comment) => comment.eventId !== id);
    // Уведомления не удаляются вместе с событием, а лишь теряют ссылку на него:
    // в БД на `event_id` стоит ON DELETE SET NULL (миграция 007). Иначе весть об
    // отмене исчезала бы одновременно с самой отменой.
    for (const notification of this.notifications) {
      if (notification.eventId === id) notification.eventId = undefined;
    }
    // А вот отметки «в избранном» уходят вместе с событием — ON DELETE CASCADE
    // (миграция 008): иначе раздел показывал бы ссылки в никуда.
    for (const owned of this.favorites.values()) owned.delete(id);
    // Приглашения тоже: вести в удалённое событие им уже некуда (миграция 009).
    this.invitations = this.invitations.filter((item) => item.eventId !== id);
    this.scheduleSave();
    return true;
  }

  async joinEvent(eventId: string, userId: string): Promise<JoinEventResult> {
    const event = this.events.find((item) => item.id === eventId);
    if (!event) return { outcome: "not-found" };
    if (event.participantIds.includes(userId)) {
      return { outcome: "already-joined", event: clone(event) };
    }
    // Проверка и запись идут подряд без await между ними: в одном процессе Node
    // это и есть атомарность. В PostgreSQL то же обеспечивает блокировка строки.
    if (
      event.participantLimit !== undefined &&
      event.participantIds.length >= event.participantLimit
    ) {
      return { outcome: "full", event: clone(event) };
    }
    event.participantIds.push(userId);
    event.participants = event.participantIds.length;
    this.scheduleSave();
    return { outcome: "joined", event: clone(event) };
  }

  async createInvitation(invitation: EventInvitation): Promise<void> {
    this.invitations.push(clone(invitation));
    this.scheduleSave();
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<EventInvitation | undefined> {
    const invitation = this.invitations.find((item) => item.tokenHash === tokenHash);
    return invitation ? clone(invitation) : undefined;
  }

  async consumeInvitation(id: string): Promise<boolean> {
    const invitation = this.invitations.find((item) => item.id === id);
    if (!invitation || invitation.revokedAt) return false;
    if (invitation.maxUses !== undefined && invitation.usedCount >= invitation.maxUses) {
      return false;
    }
    invitation.usedCount += 1;
    this.scheduleSave();
    return true;
  }

  async listInvitations(eventId: string): Promise<EventInvitation[]> {
    return clone(
      this.invitations
        .filter((item) => item.eventId === eventId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    );
  }

  async revokeInvitation(id: string, revokedAt: string): Promise<boolean> {
    const invitation = this.invitations.find((item) => item.id === id);
    if (!invitation || invitation.revokedAt) return false;
    invitation.revokedAt = revokedAt;
    this.scheduleSave();
    return true;
  }

  async leaveEvent(eventId: string, userId: string): Promise<Event | undefined> {
    const event = this.events.find((item) => item.id === eventId);
    if (!event) return undefined;
    event.participantIds = event.participantIds.filter((id) => id !== userId);
    event.participants = event.participantIds.length;
    this.scheduleSave();
    return clone(event);
  }

  async addFavorite(userId: string, eventId: string): Promise<boolean> {
    if (!this.events.some((event) => event.id === eventId)) return false;
    const owned = this.favorites.get(userId) ?? new Set<string>();
    owned.add(eventId);
    this.favorites.set(userId, owned);
    this.scheduleSave();
    return true;
  }

  async removeFavorite(userId: string, eventId: string): Promise<boolean> {
    if (!this.events.some((event) => event.id === eventId)) return false;
    // Удаление несуществующей отметки — не ошибка: нажали «убрать» дважды.
    if (this.favorites.get(userId)?.delete(eventId)) this.scheduleSave();
    return true;
  }

  async listUsers(): Promise<User[]> {
    return clone(this.users);
  }

  async getUser(id: string): Promise<User | undefined> {
    const user = this.users.find((item) => item.id === id);
    return user ? clone(user) : undefined;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLocaleLowerCase("en");
    const user = this.users.find((item) => item.email.toLocaleLowerCase("en") === normalized);
    return user ? clone(user) : undefined;
  }

  async upsertUser(user: User): Promise<User> {
    const index = this.users.findIndex((item) => item.id === user.id);
    if (index === -1) this.users.push(clone(user));
    else this.users[index] = { ...this.users[index], ...clone(user) };
    this.scheduleSave();
    return clone(this.users.find((item) => item.id === user.id)!);
  }

  async createPasswordUser(user: User, passwordHash: string): Promise<User> {
    if (await this.findUserByEmail(user.email)) {
      const error = new Error("User already exists") as Error & { code?: string };
      error.code = "23505";
      throw error;
    }
    this.users.push(clone(user));
    this.passwordCredentials.set(user.id, passwordHash);
    this.scheduleSave();
    return clone(user);
  }

  async deleteUser(id: string): Promise<boolean> {
    // Владение проверяем и по событиям, и по комментариям — как это делает
    // PostgreSQL-адаптер (в БД на обе связи стоит ON DELETE RESTRICT).
    if (this.events.some((event) => event.authorId === id)) return false;
    if (this.comments.some((comment) => comment.author.id === id)) return false;
    const before = this.users.length;
    this.users = this.users.filter((user) => user.id !== id);
    if (this.users.length === before) return false;
    for (const user of this.users) {
      user.friends = (user.friends ?? []).filter((friendId) => friendId !== id);
    }
    for (const event of this.events) {
      event.participantIds = event.participantIds.filter((userId) => userId !== id);
      event.participants = event.participantIds.length;
    }
    // Как в БД: свои уведомления удаляются вместе с пользователем (CASCADE),
    // а чужие лишь перестают на него ссылаться (SET NULL).
    this.notifications = this.notifications.filter((item) => item.userId !== id);
    for (const notification of this.notifications) {
      if (notification.actorId === id) notification.actorId = undefined;
    }
    this.favorites.delete(id);
    // Переписка уходит вместе с аккаунтом у обоих собеседников — ручное
    // повторение ON DELETE CASCADE из миграции 014.
    this.messages = this.messages.filter((item) => item.senderId !== id && item.recipientId !== id);
    this.invitations = this.invitations.filter((item) => item.createdBy !== id);
    this.scheduleSave();
    return true;
  }

  async listFriends(userId: string): Promise<User[] | undefined> {
    const user = this.users.find((item) => item.id === userId);
    if (!user) return undefined;
    const ids = new Set(user.friends ?? []);
    return clone(this.users.filter((item) => ids.has(item.id)));
  }

  /**
   * Заявка в друзья (SEC-012).
   *
   * Ожидающие заявки живут отдельным списком, а `user.friends` по-прежнему
   * означает «принятая дружба»: так снимок на диск и все существующие ответы
   * API сохраняют прежний смысл, а новое состояние не размазывается по двум
   * представлениям одного отношения.
   */
  async requestFriendship(userId: string, friendId: string): Promise<FriendshipOutcome> {
    if (userId === friendId) return "self";
    const user = this.users.find((item) => item.id === userId);
    const friend = this.users.find((item) => item.id === friendId);
    if (!user || !friend) return "not-found";

    if ((user.friends ?? []).includes(friendId)) return "already-friends";

    // Встречная заявка: «добавить в друзья» в ответ на приглашение и есть согласие.
    const incoming = this.friendRequests.find(
      (item) => item.from === friendId && item.to === userId,
    );
    if (incoming) {
      this.friendRequests = this.friendRequests.filter((item) => item !== incoming);
      this.linkFriends(user, friend);
      this.scheduleSave();
      return "accepted";
    }

    if (this.friendRequests.some((item) => item.from === userId && item.to === friendId)) {
      return "already-requested";
    }

    this.friendRequests.push({ from: userId, to: friendId, createdAt: new Date().toISOString() });
    this.scheduleSave();
    return "requested";
  }

  async listFriendRequests(userId: string): Promise<FriendRequests | undefined> {
    if (!this.users.some((item) => item.id === userId)) return undefined;
    const byId = (id: string) => this.users.find((item) => item.id === id);
    return {
      incoming: clone(
        this.friendRequests
          .filter((item) => item.to === userId)
          .map((item) => byId(item.from))
          .filter((item): item is User => Boolean(item)),
      ),
      outgoing: clone(
        this.friendRequests
          .filter((item) => item.from === userId)
          .map((item) => byId(item.to))
          .filter((item): item is User => Boolean(item)),
      ),
    };
  }

  async acceptFriendRequest(userId: string, requesterId: string): Promise<boolean> {
    const user = this.users.find((item) => item.id === userId);
    const requester = this.users.find((item) => item.id === requesterId);
    if (!user || !requester) return false;
    const pending = this.friendRequests.find(
      (item) => item.from === requesterId && item.to === userId,
    );
    if (!pending) return false;
    this.friendRequests = this.friendRequests.filter((item) => item !== pending);
    this.linkFriends(user, requester);
    this.scheduleSave();
    return true;
  }

  /** Симметричная запись принятой дружбы. */
  private linkFriends(user: User, friend: User): void {
    user.friends = [...new Set([...(user.friends ?? []), friend.id])];
    friend.friends = [...new Set([...(friend.friends ?? []), user.id])];
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean | undefined> {
    const user = this.users.find((item) => item.id === userId);
    const friend = this.users.find((item) => item.id === friendId);
    if (!user || !friend) return undefined;
    const hadFriendship =
      (user.friends ?? []).includes(friendId) || (friend.friends ?? []).includes(userId);
    // Один метод на три действия: расторгнуть дружбу, отклонить чужую заявку и
    // отозвать свою. Снаружи это одно и то же — «убрать связь».
    const requestCount = this.friendRequests.length;
    this.friendRequests = this.friendRequests.filter(
      (item) =>
        !(
          (item.from === userId && item.to === friendId) ||
          (item.from === friendId && item.to === userId)
        ),
    );
    const hadRequest = this.friendRequests.length !== requestCount;
    user.friends = (user.friends ?? []).filter((id) => id !== friendId);
    friend.friends = (friend.friends ?? []).filter((id) => id !== userId);
    this.scheduleSave();
    return hadFriendship || hadRequest;
  }

  async areFriends(userId: string, peerId: string): Promise<boolean> {
    if (userId === peerId) return false;
    const user = this.users.find((item) => item.id === userId);
    return Boolean(user?.friends?.includes(peerId));
  }

  async sendDirectMessage(input: CreateMessageInput): Promise<SendMessageResult> {
    // Все причины отказа сведены в один исход намеренно: различив «нет такого
    // пользователя» и «вы не друзья», мы дали бы способ перебором выяснять,
    // существует ли аккаунт.
    if (!(await this.areFriends(input.senderId, input.recipientId)))
      return { outcome: "not-allowed" };

    const firstUnread = !this.messages.some(
      (item) =>
        item.senderId === input.senderId && item.recipientId === input.recipientId && !item.readAt,
    );
    const message: DirectMessage = {
      id: input.id,
      senderId: input.senderId,
      recipientId: input.recipientId,
      text: input.text,
      createdAt: input.createdAt,
    };
    this.messages.push(message);
    this.scheduleSave();
    return { outcome: "sent", message: clone(message), firstUnread };
  }

  async getDirectMessage(id: string): Promise<DirectMessage | undefined> {
    const message = this.messages.find((item) => item.id === id);
    return message ? clone(message) : undefined;
  }

  async updateDirectMessage(
    id: string,
    senderId: string,
    text: string,
    editedAt: string,
  ): Promise<DirectMessage | undefined> {
    const message = this.messages.find((item) => item.id === id && item.senderId === senderId);
    if (!message) return undefined;
    // Правка — это доставка нового текста, то есть та же отправка. Разреши её
    // без проверки дружбы — и «убрать из друзей» перестанет закрывать канал.
    if (!(await this.areFriends(senderId, message.recipientId))) return undefined;
    message.text = text;
    message.editedAt = editedAt;
    this.scheduleSave();
    return clone(message);
  }

  async deleteDirectMessage(id: string, senderId: string): Promise<boolean> {
    const before = this.messages.length;
    this.messages = this.messages.filter((item) => !(item.id === id && item.senderId === senderId));
    if (this.messages.length === before) return false;
    this.scheduleSave();
    return true;
  }

  async listDirectMessages(
    userId: string,
    peerId: string,
    filters: MessageThreadFilters,
  ): Promise<DirectMessage[]> {
    const key = threadKey(userId, peerId);
    const items = this.messages
      .filter((item) => threadKey(item.senderId, item.recipientId) === key)
      .sort((left, right) => compareMessages(cursorOfMessage(left), cursorOfMessage(right)));
    const page = filters.cursor
      ? items.filter((item) => isAfterMessageCursor(cursorOfMessage(item), filters.cursor!))
      : items;
    return clone(page.slice(0, filters.limit));
  }

  async listDialogs(userId: string, limit: number): Promise<Dialog[]> {
    const mine = this.messages.filter(
      (item) => item.senderId === userId || item.recipientId === userId,
    );
    const byPeer = new Map<string, { last: DirectMessage; unread: number }>();
    for (const message of mine) {
      const peerId = message.senderId === userId ? message.recipientId : message.senderId;
      const current = byPeer.get(peerId);
      const unread = current?.unread ?? 0;
      const isNewer =
        !current || compareMessages(cursorOfMessage(message), cursorOfMessage(current.last)) < 0;
      byPeer.set(peerId, {
        last: isNewer ? message : current!.last,
        unread: unread + (message.recipientId === userId && !message.readAt ? 1 : 0),
      });
    }

    return [...byPeer.entries()]
      .map(([peerId, { last, unread }]) => {
        const peer = this.users.find((item) => item.id === peerId);
        return peer ? { peer: clone(peer), lastMessage: clone(last), unread } : undefined;
      })
      .filter((item): item is Dialog => Boolean(item))
      .sort((left, right) =>
        compareMessages(cursorOfMessage(left.lastMessage), cursorOfMessage(right.lastMessage)),
      )
      .slice(0, limit);
  }

  async countUnreadDirectMessages(userId: string): Promise<number> {
    return this.messages.filter((item) => item.recipientId === userId && !item.readAt).length;
  }

  async markDirectMessagesRead(userId: string, peerId: string, readAt: string): Promise<number> {
    // «Своё/чужое» зашито в условие: пометить прочитанными чужие сообщения
    // нельзя даже подставив идентификатор.
    const unread = this.messages.filter(
      (item) => item.recipientId === userId && item.senderId === peerId && !item.readAt,
    );
    for (const message of unread) message.readAt = readAt;
    if (unread.length > 0) this.scheduleSave();
    return unread.length;
  }

  async listComments(eventId: string): Promise<Comment[]> {
    return clone(this.comments.filter((comment) => comment.eventId === eventId));
  }

  async getComment(id: string): Promise<Comment | undefined> {
    const comment = this.comments.find((item) => item.id === id);
    return comment ? clone(comment) : undefined;
  }

  async createComment(input: CreateCommentInput): Promise<Comment> {
    const author = this.users.find((user) => user.id === input.authorId);
    if (!author) throw new Error(`Unknown comment author: ${input.authorId}`);
    const comment: Comment = {
      id: input.id,
      text: input.text,
      eventId: input.eventId,
      author: clone(author),
      createdAt: input.createdAt,
    };
    this.comments.push(comment);
    this.scheduleSave();
    return clone(comment);
  }

  async updateComment(id: string, text: string, editedAt: string): Promise<Comment | undefined> {
    const comment = this.comments.find((item) => item.id === id);
    if (!comment) return undefined;
    comment.text = text;
    comment.editedAt = editedAt;
    this.scheduleSave();
    return clone(comment);
  }

  async deleteComment(id: string): Promise<boolean> {
    const before = this.comments.length;
    this.comments = this.comments.filter((comment) => comment.id !== id);
    if (this.comments.length === before) return false;
    this.scheduleSave();
    return true;
  }

  async createNotifications(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;
    this.notifications.push(...clone(notifications));
    this.scheduleSave();
  }

  async listNotifications(userId: string, limit: number): Promise<Notification[]> {
    return clone(
      this.notifications
        .filter((item) => item.userId === userId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit),
    );
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    return this.notifications.filter((item) => item.userId === userId && !item.readAt).length;
  }

  async markNotificationsRead(userId: string, readAt: string, ids?: string[]): Promise<number> {
    const wanted = ids ? new Set(ids) : undefined;
    let updated = 0;
    for (const item of this.notifications) {
      if (item.userId !== userId || item.readAt) continue;
      if (wanted && !wanted.has(item.id)) continue;
      item.readAt = readAt;
      updated += 1;
    }
    if (updated > 0) this.scheduleSave();
    return updated;
  }

  async getPasswordHash(userId: string): Promise<string | undefined> {
    return this.passwordCredentials.get(userId);
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    this.passwordCredentials.set(userId, passwordHash);
    this.scheduleSave();
  }

  async createSession(session: AuthSession): Promise<void> {
    this.sessions.set(session.tokenHash, clone(session));
    this.scheduleSave();
  }

  async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const session = this.sessions.get(tokenHash);
    return session ? clone(session) : undefined;
  }

  async touchSession(id: string, usedAt: string): Promise<void> {
    const session = [...this.sessions.values()].find((item) => item.id === id);
    if (!session) return;
    session.lastUsedAt = usedAt;
  }

  async revokeSession(id: string): Promise<void> {
    const session = [...this.sessions.values()].find((item) => item.id === id);
    if (!session) return;
    session.revokedAt = new Date().toISOString();
    this.scheduleSave();
  }

  async deleteExpiredSessions(now: string): Promise<number> {
    const cutoff = Date.parse(now);
    let removed = 0;
    for (const [key, session] of this.sessions) {
      if (Boolean(session.revokedAt) || Date.parse(session.expiresAt) <= cutoff) {
        this.sessions.delete(key);
        removed += 1;
      }
    }
    if (removed > 0) this.scheduleSave();
    return removed;
  }

  async revokeUserSessions(userId: string, revokedAt: string): Promise<number> {
    let revoked = 0;
    for (const session of this.sessions.values()) {
      if (session.userId !== userId || session.revokedAt) continue;
      session.revokedAt = revokedAt;
      revoked += 1;
    }
    if (revoked > 0) this.scheduleSave();
    return revoked;
  }

  async createPasswordResetToken(token: PasswordResetToken): Promise<void> {
    this.passwordResetTokens.push(clone(token));
    this.scheduleSave();
  }

  async getPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const token = this.passwordResetTokens.find((item) => item.tokenHash === tokenHash);
    return token ? clone(token) : undefined;
  }

  async consumePasswordResetToken(id: string, usedAt: string): Promise<boolean> {
    const token = this.passwordResetTokens.find((item) => item.id === id);
    if (!token || token.usedAt) return false;
    token.usedAt = usedAt;
    this.scheduleSave();
    return true;
  }

  async deleteExpiredPasswordResetTokens(now: string): Promise<number> {
    const before = this.passwordResetTokens.length;
    const cutoff = Date.parse(now);
    this.passwordResetTokens = this.passwordResetTokens.filter(
      (token) => !token.usedAt && Date.parse(token.expiresAt) > cutoff,
    );
    const removed = before - this.passwordResetTokens.length;
    if (removed > 0) this.scheduleSave();
    return removed;
  }

  async getExternalIdentity(
    provider: string,
    externalUserId: string,
  ): Promise<ExternalIdentity | undefined> {
    const identity = this.externalIdentities.get(this.identityKey(provider, externalUserId));
    return identity ? clone(identity) : undefined;
  }

  async linkExternalIdentity(identity: ExternalIdentity): Promise<void> {
    this.externalIdentities.set(
      this.identityKey(identity.provider, identity.externalUserId),
      clone(identity),
    );
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.persistFile) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.persistFile!), { recursive: true });
        fs.writeFileSync(
          this.persistFile!,
          JSON.stringify(
            {
              users: this.users,
              events: this.events,
              comments: this.comments,
              notifications: this.notifications,
              messages: this.messages,
              favorites: [...this.favorites.entries()].map(([userId, ids]) => [userId, [...ids]]),
              invitations: this.invitations,
              passwordCredentials: [...this.passwordCredentials.entries()],
              sessions: [...this.sessions.values()],
              externalIdentities: [...this.externalIdentities.values()],
            },
            null,
            2,
          ),
        );
      } catch (error) {
        logger.error("[store] ошибка записи локального снимка:", error);
      }
    }, 50);
  }

  private normalizeRelations(): void {
    this.events = this.events.map((storedEvent) => {
      const event = storedEvent as Event | LegacyEvent;
      if (!("startsAt" in event)) {
        const { date, time, ...rest } = event;
        return {
          ...rest,
          startsAt: eventDateToIso(date, time),
          timezone: "Europe/Moscow",
        };
      }
      return event;
    });
    for (const event of this.events) {
      event.participantIds = [...new Set(event.participantIds ?? [])];
      event.participants = event.participantIds.length;
    }
    for (const user of this.users) {
      user.friends = [...new Set(user.friends ?? [])];
    }
  }

  private identityKey(provider: string, externalUserId: string): string {
    return `${provider}\u0000${externalUserId}`;
  }
}
