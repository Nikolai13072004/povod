import fs from "node:fs";
import path from "node:path";
import type { Comment, Event, User } from "../types";
import type {
  AuthSession,
  CreateCommentInput,
  EventFilters,
  ExternalIdentity,
  PovodRepository,
} from "./repository";
import { seedComments, seedEvents, seedUsers } from "../seed";
import { eventDateToIso } from "../db/eventDate";
import { logger } from "../logger";

type LegacyEvent = Omit<Event, "startsAt" | "timezone"> & {
  date: string;
  time?: string;
};

interface Snapshot {
  users: User[];
  events: Event[];
  comments: Comment[];
  passwordCredentials?: Array<[string, string]>;
  sessions?: AuthSession[];
  externalIdentities?: ExternalIdentity[];
}

const clone = <T>(value: T): T => structuredClone(value);

function canonicalFriendship(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

export class MemoryRepository implements PovodRepository {
  private users: User[] = clone(seedUsers);
  private events: Event[] = clone(seedEvents);
  private comments: Comment[] = clone(seedComments);
  private passwordCredentials = new Map<string, string>();
  private sessions = new Map<string, AuthSession>();
  private externalIdentities = new Map<string, ExternalIdentity>();
  private readonly persistFile?: string;
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(persistFile?: string) {
    this.persistFile = persistFile;
    this.normalizeRelations();
  }

  async init(): Promise<void> {
    if (!this.persistFile || !fs.existsSync(this.persistFile)) return;
    try {
      const snapshot = JSON.parse(fs.readFileSync(this.persistFile, "utf8")) as Partial<Snapshot>;
      this.users = clone(snapshot.users ?? []);
      this.events = clone(snapshot.events ?? []);
      this.comments = clone(snapshot.comments ?? []);
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
      const query = filters.search.toLocaleLowerCase("ru");
      items = items.filter(
        (event) =>
          event.title.toLocaleLowerCase("ru").includes(query) ||
          event.description.toLocaleLowerCase("ru").includes(query),
      );
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
    }
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
    this.scheduleSave();
    return true;
  }

  async joinEvent(eventId: string, userId: string): Promise<Event | undefined> {
    const event = this.events.find((item) => item.id === eventId);
    if (!event) return undefined;
    if (!event.participantIds.includes(userId)) event.participantIds.push(userId);
    event.participants = event.participantIds.length;
    this.scheduleSave();
    return clone(event);
  }

  async leaveEvent(eventId: string, userId: string): Promise<Event | undefined> {
    const event = this.events.find((item) => item.id === eventId);
    if (!event) return undefined;
    event.participantIds = event.participantIds.filter((id) => id !== userId);
    event.participants = event.participantIds.length;
    this.scheduleSave();
    return clone(event);
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
    if (this.events.some((event) => event.authorId === id)) return false;
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
    this.scheduleSave();
    return true;
  }

  async listFriends(userId: string): Promise<User[] | undefined> {
    const user = this.users.find((item) => item.id === userId);
    if (!user) return undefined;
    const ids = new Set(user.friends ?? []);
    return clone(this.users.filter((item) => ids.has(item.id)));
  }

  async addFriend(userId: string, friendId: string): Promise<User | undefined> {
    const user = this.users.find((item) => item.id === userId);
    const friend = this.users.find((item) => item.id === friendId);
    if (!user || !friend) return undefined;
    const [left, right] = canonicalFriendship(userId, friendId);
    const leftUser = this.users.find((item) => item.id === left)!;
    const rightUser = this.users.find((item) => item.id === right)!;
    leftUser.friends = [...new Set([...(leftUser.friends ?? []), right])];
    rightUser.friends = [...new Set([...(rightUser.friends ?? []), left])];
    this.scheduleSave();
    return clone(user);
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean | undefined> {
    const user = this.users.find((item) => item.id === userId);
    const friend = this.users.find((item) => item.id === friendId);
    if (!user || !friend) return undefined;
    const hadFriendship =
      (user.friends ?? []).includes(friendId) || (friend.friends ?? []).includes(userId);
    user.friends = (user.friends ?? []).filter((id) => id !== friendId);
    friend.friends = (friend.friends ?? []).filter((id) => id !== userId);
    this.scheduleSave();
    return hadFriendship;
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

  async deleteComment(id: string): Promise<boolean> {
    const before = this.comments.length;
    this.comments = this.comments.filter((comment) => comment.id !== id);
    if (this.comments.length === before) return false;
    this.scheduleSave();
    return true;
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
