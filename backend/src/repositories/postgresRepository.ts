import type { Pool, PoolClient } from "pg";
import type { Comment, Event, User } from "../types";
import type {
  AuthSession,
  CreateCommentInput,
  EventFilters,
  ExternalIdentity,
  PovodRepository,
} from "./repository";
import { eventDateToIso } from "../db/eventDate";
import { runMigrations } from "../db/migrations";
import { seedComments, seedEvents, seedUsers } from "../seed";

interface EventRow {
  id: string;
  title: string;
  description: string;
  starts_at: Date | string;
  timezone: string;
  location: string;
  category: string | null;
  author_id: string;
  author_name: string;
  participant_ids: string[];
  image_url: string | null;
  tags: string[];
  latitude: number | null;
  longitude: number | null;
  visibility: "public" | "private";
  created_at: Date | string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  interests: string[];
  friend_ids?: string[];
  created_at: Date | string;
}

interface CommentRow {
  id: string;
  text: string;
  event_id: string;
  created_at: Date | string;
  author_id: string;
  author_name: string;
  author_email: string;
  author_avatar_url: string | null;
  author_interests: string[];
  author_created_at: Date | string;
}

interface SessionRow {
  id: string;
  token_hash: string;
  user_id: string;
  created_at: Date | string;
  expires_at: Date | string;
  last_used_at: Date | string;
  revoked_at: Date | string | null;
}

type LegacyEvent = Omit<Event, "startsAt" | "timezone"> & {
  date: string;
  time?: string;
};

interface ImportDataset {
  users: User[];
  events: Array<Event | LegacyEvent>;
  comments: Comment[];
}

function importedEventTime(event: Event | LegacyEvent): {
  startsAt: string;
  timezone: string;
} {
  return "startsAt" in event
    ? { startsAt: event.startsAt, timezone: event.timezone }
    : {
        startsAt: eventDateToIso(event.date, event.time),
        timezone: "Europe/Moscow",
      };
}

const EVENT_SELECT = `
  SELECT
    e.id, e.title, e.description, e.starts_at, e.timezone, e.location, e.category,
    e.author_id, author.name AS author_name, e.image_url, e.tags,
    e.latitude, e.longitude, e.visibility, e.created_at,
    COALESCE(participants.ids, '{}') AS participant_ids
  FROM events e
  JOIN users author ON author.id = e.author_id
  LEFT JOIN LATERAL (
    SELECT array_agg(ep.user_id ORDER BY ep.joined_at) AS ids
    FROM event_participants ep
    WHERE ep.event_id = e.id
  ) participants ON true
`;

const USER_SELECT = `
  SELECT
    u.id, u.name, u.email, u.avatar_url, u.interests, u.created_at,
    COALESCE(friends.ids, '{}') AS friend_ids
  FROM users u
  LEFT JOIN LATERAL (
    SELECT array_agg(
      CASE WHEN f.user_id = u.id THEN f.friend_id ELSE f.user_id END
      ORDER BY f.created_at
    ) AS ids
    FROM friendships f
    WHERE f.user_id = u.id OR f.friend_id = u.id
  ) friends ON true
`;

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function mapEvent(row: EventRow): Event {
  const participantIds = row.participant_ids ?? [];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: toIso(row.starts_at),
    timezone: row.timezone,
    location: row.location,
    category: row.category ?? undefined,
    author: row.author_name,
    authorId: row.author_id,
    participants: participantIds.length,
    participantIds,
    image: row.image_url ?? undefined,
    tags: row.tags?.length ? row.tags : undefined,
    coords:
      row.latitude === null || row.longitude === null ? undefined : [row.latitude, row.longitude],
    format: row.visibility,
    createdAt: toIso(row.created_at),
  };
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar_url ?? undefined,
    interests: row.interests ?? [],
    friends: row.friend_ids ?? [],
    createdAt: toIso(row.created_at),
  };
}

function mapComment(row: CommentRow): Comment {
  return {
    id: row.id,
    text: row.text,
    eventId: row.event_id,
    createdAt: toIso(row.created_at),
    author: {
      id: row.author_id,
      name: row.author_name,
      email: row.author_email,
      avatar: row.author_avatar_url ?? undefined,
      interests: row.author_interests ?? [],
      createdAt: toIso(row.author_created_at),
    },
  };
}

function canonicalFriendship(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

export class PostgresRepository implements PovodRepository {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await runMigrations(client);
      await this.seedOrImport(client);
    } finally {
      client.release();
    }
  }

  async listEvents(filters: EventFilters = {}): Promise<Event[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, value: unknown) => {
      values.push(value);
      conditions.push(condition.replace("?", `$${values.length}`));
    };

    if (filters.search) {
      values.push(`%${filters.search}%`, `%${filters.search}%`);
      conditions.push(
        `(e.title ILIKE $${values.length - 1} OR e.description ILIKE $${values.length})`,
      );
    }
    if (filters.category) add("lower(e.category) = lower(?)", filters.category);
    if (filters.startsFrom) add("e.starts_at >= ?", filters.startsFrom);
    if (filters.startsTo) add("e.starts_at < ?", filters.startsTo);
    if (filters.author) {
      values.push(filters.author, filters.author);
      conditions.push(`(e.author_id = $${values.length - 1} OR author.name = $${values.length})`);
    }
    if (filters.participant) {
      add(
        "EXISTS (SELECT 1 FROM event_participants selected_ep WHERE selected_ep.event_id = e.id AND selected_ep.user_id = ?)",
        filters.participant,
      );
    }
    if (filters.viewerId) {
      values.push(filters.viewerId);
      conditions.push(
        `(e.visibility = 'public' OR e.author_id = $${values.length} OR EXISTS (
          SELECT 1 FROM event_participants viewer_ep
          WHERE viewer_ep.event_id = e.id AND viewer_ep.user_id = $${values.length}
        ))`,
      );
    } else {
      conditions.push("e.visibility = 'public'");
    }
    if (filters.activeAfter) add("e.starts_at >= ?", filters.activeAfter);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const order = filters.sort
      ? `ORDER BY e.starts_at ${filters.sort === "asc" ? "ASC" : "DESC"}`
      : "ORDER BY e.created_at DESC";
    const result = await this.pool.query<EventRow>(`${EVENT_SELECT} ${where} ${order}`, values);
    return result.rows.map(mapEvent);
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const result = await this.pool.query<EventRow>(`${EVENT_SELECT} WHERE e.id = $1`, [id]);
    return result.rows[0] ? mapEvent(result.rows[0]) : undefined;
  }

  async createEvent(event: Event): Promise<Event> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO events (
          id, title, description, starts_at, timezone, location, category, author_id,
          image_url, tags, latitude, longitude, visibility, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          event.id,
          event.title,
          event.description,
          event.startsAt,
          event.timezone,
          event.location,
          event.category ?? null,
          event.authorId,
          event.image ?? null,
          event.tags ?? [],
          event.coords?.[0] ?? null,
          event.coords?.[1] ?? null,
          event.format ?? "public",
          event.createdAt,
        ],
      );
      for (const userId of new Set(event.participantIds)) {
        await client.query(
          `INSERT INTO event_participants (event_id, user_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [event.id, userId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return (await this.getEvent(event.id))!;
  }

  async updateEvent(id: string, patch: Partial<Event>): Promise<Event | undefined> {
    const current = await this.getEvent(id);
    if (!current) return undefined;
    const next = { ...current, ...patch, id };
    await this.pool.query(
      `UPDATE events SET
        title = $2, description = $3, starts_at = $4, timezone = $5, location = $6,
        category = $7, author_id = $8, image_url = $9, tags = $10,
        latitude = $11, longitude = $12, visibility = $13
       WHERE id = $1`,
      [
        id,
        next.title,
        next.description,
        next.startsAt,
        next.timezone,
        next.location,
        next.category ?? null,
        next.authorId,
        next.image ?? null,
        next.tags ?? [],
        next.coords?.[0] ?? null,
        next.coords?.[1] ?? null,
        next.format ?? "public",
      ],
    );
    return this.getEvent(id);
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM events WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async joinEvent(eventId: string, userId: string): Promise<Event | undefined> {
    const exists = await this.getEvent(eventId);
    if (!exists) return undefined;
    await this.pool.query(
      `INSERT INTO event_participants (event_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [eventId, userId],
    );
    return this.getEvent(eventId);
  }

  async leaveEvent(eventId: string, userId: string): Promise<Event | undefined> {
    const exists = await this.getEvent(eventId);
    if (!exists) return undefined;
    await this.pool.query("DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2", [
      eventId,
      userId,
    ]);
    return this.getEvent(eventId);
  }

  async listUsers(): Promise<User[]> {
    const result = await this.pool.query<UserRow>(`${USER_SELECT} ORDER BY u.created_at`);
    return result.rows.map(mapUser);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(
      `${USER_SELECT} WHERE lower(u.email) = lower($1)`,
      [email.trim()],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async upsertUser(user: User): Promise<User> {
    await this.pool.query(
      `INSERT INTO users (id, name, email, avatar_url, interests, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         avatar_url = EXCLUDED.avatar_url,
         interests = EXCLUDED.interests`,
      [user.id, user.name, user.email, user.avatar ?? null, user.interests ?? [], user.createdAt],
    );
    return (await this.getUser(user.id))!;
  }

  async createPasswordUser(user: User, passwordHash: string): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, name, email, avatar_url, interests, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.name, user.email, user.avatar ?? null, user.interests ?? [], user.createdAt],
      );
      await client.query(
        `INSERT INTO password_credentials (user_id, password_hash)
         VALUES ($1, $2)`,
        [user.id, passwordHash],
      );
      await client.query("COMMIT");
      return (await this.getUser(user.id))!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM users WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listFriends(userId: string): Promise<User[] | undefined> {
    if (!(await this.getUser(userId))) return undefined;
    const result = await this.pool.query<UserRow>(
      `${USER_SELECT}
       WHERE u.id IN (
         SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
         FROM friendships f
         WHERE f.user_id = $1 OR f.friend_id = $1
       )
       ORDER BY u.name`,
      [userId],
    );
    return result.rows.map(mapUser);
  }

  async addFriend(userId: string, friendId: string): Promise<User | undefined> {
    if (userId === friendId) return this.getUser(userId);
    const [user, friend] = await Promise.all([this.getUser(userId), this.getUser(friendId)]);
    if (!user || !friend) return undefined;
    const [left, right] = canonicalFriendship(userId, friendId);
    await this.pool.query(
      `INSERT INTO friendships (user_id, friend_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [left, right],
    );
    return this.getUser(userId);
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean | undefined> {
    const [user, friend] = await Promise.all([this.getUser(userId), this.getUser(friendId)]);
    if (!user || !friend) return undefined;
    const [left, right] = canonicalFriendship(userId, friendId);
    const result = await this.pool.query(
      "DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2",
      [left, right],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listComments(eventId: string): Promise<Comment[]> {
    const result = await this.pool.query<CommentRow>(
      `SELECT
         c.id, c.text, c.event_id, c.created_at,
         u.id AS author_id, u.name AS author_name, u.email AS author_email,
         u.avatar_url AS author_avatar_url, u.interests AS author_interests,
         u.created_at AS author_created_at
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.event_id = $1
       ORDER BY c.created_at`,
      [eventId],
    );
    return result.rows.map(mapComment);
  }

  async getComment(id: string): Promise<Comment | undefined> {
    const result = await this.pool.query<CommentRow>(
      `SELECT
         c.id, c.text, c.event_id, c.created_at,
         u.id AS author_id, u.name AS author_name, u.email AS author_email,
         u.avatar_url AS author_avatar_url, u.interests AS author_interests,
         u.created_at AS author_created_at
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.id = $1`,
      [id],
    );
    return result.rows[0] ? mapComment(result.rows[0]) : undefined;
  }

  async createComment(input: CreateCommentInput): Promise<Comment> {
    await this.pool.query(
      `INSERT INTO comments (id, text, event_id, author_id, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.id, input.text, input.eventId, input.authorId, input.createdAt],
    );
    const comments = await this.listComments(input.eventId);
    return comments.find((comment) => comment.id === input.id)!;
  }

  async deleteComment(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM comments WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async getPasswordHash(userId: string): Promise<string | undefined> {
    const result = await this.pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM password_credentials WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.password_hash;
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_credentials (user_id, password_hash, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
      [userId, passwordHash],
    );
  }

  async createSession(session: AuthSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_sessions (
         id, token_hash, user_id, created_at, expires_at, last_used_at, revoked_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        session.tokenHash,
        session.userId,
        session.createdAt,
        session.expiresAt,
        session.lastUsedAt,
        session.revokedAt ?? null,
      ],
    );
  }

  async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, token_hash, user_id, created_at, expires_at, last_used_at, revoked_at
       FROM auth_sessions
       WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      tokenHash: row.token_hash,
      userId: row.user_id,
      createdAt: toIso(row.created_at),
      expiresAt: toIso(row.expires_at),
      lastUsedAt: toIso(row.last_used_at),
      revokedAt: row.revoked_at ? toIso(row.revoked_at) : undefined,
    };
  }

  async touchSession(id: string, usedAt: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_sessions
       SET last_used_at = $2
       WHERE id = $1 AND last_used_at < $2::timestamptz - interval '5 minutes'`,
      [id, usedAt],
    );
  }

  async revokeSession(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
      [id],
    );
  }

  async getExternalIdentity(
    provider: string,
    externalUserId: string,
  ): Promise<ExternalIdentity | undefined> {
    const result = await this.pool.query<{
      provider: string;
      external_user_id: string;
      user_id: string;
      profile: Record<string, unknown>;
    }>(
      `SELECT provider, external_user_id, user_id, profile
       FROM external_identities
       WHERE provider = $1 AND external_user_id = $2`,
      [provider, externalUserId],
    );
    const row = result.rows[0];
    return row
      ? {
          provider: row.provider,
          externalUserId: row.external_user_id,
          userId: row.user_id,
          profile: row.profile,
        }
      : undefined;
  }

  async linkExternalIdentity(identity: ExternalIdentity): Promise<void> {
    await this.pool.query(
      `INSERT INTO external_identities (
         provider, external_user_id, user_id, profile, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (provider, external_user_id) DO UPDATE
         SET profile = EXCLUDED.profile, updated_at = now()`,
      [
        identity.provider,
        identity.externalUserId,
        identity.userId,
        JSON.stringify(identity.profile ?? {}),
      ],
    );
  }

  private async seedOrImport(client: PoolClient): Promise<void> {
    const bootstrap = await client.query(
      "SELECT 1 FROM app_metadata WHERE key = 'bootstrap_completed'",
    );
    if ((bootstrap.rowCount ?? 0) > 0) return;

    const count = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users",
    );
    if (Number(count.rows[0]?.count ?? 0) > 0) {
      await this.markBootstrapCompleted(client, "existing_normalized_data");
      return;
    }

    const legacyTable = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.app_snapshot') IS NOT NULL AS exists",
    );
    let source: ImportDataset = {
      users: seedUsers,
      events: seedEvents,
      comments: seedComments,
    };
    let sourceLabel = "seed-данные";
    if (legacyTable.rows[0]?.exists) {
      const legacy = await client.query<{
        data: {
          users?: User[];
          events?: Array<Event | LegacyEvent>;
          comments?: Comment[];
        };
      }>("SELECT data FROM app_snapshot WHERE id = 1");
      if (legacy.rows[0]?.data) {
        source = {
          users: legacy.rows[0].data.users ?? [],
          events: legacy.rows[0].data.events ?? [],
          comments: legacy.rows[0].data.comments ?? [],
        };
        sourceLabel = "app_snapshot";
      }
    }

    await client.query("BEGIN");
    try {
      await this.importDataset(client, source);
      await this.markBootstrapCompleted(client, sourceLabel);
      await client.query("COMMIT");
      console.log(`[db] нормализованные таблицы заполнены из ${sourceLabel}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  private async markBootstrapCompleted(client: PoolClient, source: string): Promise<void> {
    await client.query(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES ('bootstrap_completed', jsonb_build_object('source', $1::text), now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [source],
    );
  }

  private async importDataset(client: PoolClient, source: ImportDataset): Promise<void> {
    const users = new Map(source.users.map((user) => [user.id, user]));
    for (const comment of source.comments) users.set(comment.author.id, comment.author);

    for (const user of users.values()) {
      await client.query(
        `INSERT INTO users (id, name, email, avatar_url, interests, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [user.id, user.name, user.email, user.avatar ?? null, user.interests ?? [], user.createdAt],
      );
    }

    const friendships = new Set<string>();
    for (const user of users.values()) {
      for (const friendId of user.friends ?? []) {
        if (!users.has(friendId) || friendId === user.id) continue;
        const pair = canonicalFriendship(user.id, friendId);
        friendships.add(`${pair[0]}\u0000${pair[1]}`);
      }
    }
    for (const friendship of friendships) {
      const [left, right] = friendship.split("\u0000");
      await client.query(
        `INSERT INTO friendships (user_id, friend_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [left, right],
      );
    }

    for (const event of source.events) {
      if (!users.has(event.authorId)) continue;
      const eventTime = importedEventTime(event);
      await client.query(
        `INSERT INTO events (
          id, title, description, starts_at, timezone, location, category, author_id,
          image_url, tags, latitude, longitude, visibility, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO NOTHING`,
        [
          event.id,
          event.title,
          event.description,
          eventTime.startsAt,
          eventTime.timezone,
          event.location,
          event.category ?? null,
          event.authorId,
          event.image ?? null,
          event.tags ?? [],
          event.coords?.[0] ?? null,
          event.coords?.[1] ?? null,
          event.format ?? "public",
          event.createdAt,
        ],
      );
      for (const userId of new Set(event.participantIds)) {
        if (!users.has(userId)) continue;
        await client.query(
          `INSERT INTO event_participants (event_id, user_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [event.id, userId],
        );
      }
    }

    const eventIds = new Set(source.events.map((event) => event.id));
    for (const comment of source.comments) {
      if (!eventIds.has(comment.eventId) || !users.has(comment.author.id)) continue;
      await client.query(
        `INSERT INTO comments (id, event_id, author_id, text, created_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [comment.id, comment.eventId, comment.author.id, comment.text, comment.createdAt],
      );
    }
  }
}
