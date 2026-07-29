import type { Pool, PoolClient } from "pg";
import type {
  Comment,
  Dialog,
  DirectMessage,
  Event,
  EventInvitation,
  Notification,
  NotificationType,
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
import { threadKey } from "../directMessages.js";
import { eventDateToIso } from "../db/eventDate.js";
import { runMigrations } from "../db/migrations.js";
import { seedComments, seedEvents, seedUsers } from "../seed.js";
import { logger } from "../logger.js";

interface EventRow {
  id: string;
  title: string;
  description: string;
  starts_at: Date | string;
  ends_at: Date | string | null;
  timezone: string;
  location: string;
  category: string | null;
  author_id: string;
  author_name: string;
  participant_limit: number | null;
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
  city: string | null;
  interests: string[];
  friend_ids?: string[];
  created_at: Date | string;
}

interface CommentRow {
  id: string;
  text: string;
  event_id: string;
  created_at: Date | string;
  edited_at: Date | string | null;
  author_id: string;
  author_name: string;
  author_email: string;
  author_avatar_url: string | null;
  author_interests: string[];
  author_created_at: Date | string;
}

interface InvitationRow {
  id: string;
  event_id: string;
  token_hash: string;
  created_by: string;
  created_at: Date | string;
  expires_at: Date | string | null;
  max_uses: number | null;
  used_count: number;
  revoked_at: Date | string | null;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  event_id: string | null;
  event_title: string | null;
  actor_id: string | null;
  actor_name: string | null;
  changes: string[] | null;
  created_at: Date | string;
  read_at: Date | string | null;
}

interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date | string;
  expires_at: Date | string;
  used_at: Date | string | null;
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
    e.id, e.title, e.description, e.starts_at, e.ends_at, e.timezone, e.location, e.category,
    e.author_id, author.name AS author_name, e.image_url, e.tags,
    e.latitude, e.longitude, e.visibility, e.participant_limit, e.created_at,
    COALESCE(participants.ids, '{}') AS participant_ids
  FROM events e
  JOIN users author ON author.id = e.author_id
  LEFT JOIN LATERAL (
    SELECT array_agg(ep.user_id ORDER BY ep.joined_at) AS ids
    FROM event_participants ep
    WHERE ep.event_id = e.id
  ) participants ON true
`;

/*
 * `status = 'accepted'` обязателен.
 *
 * Без него сюда попадали и неподтверждённые заявки, и `user.friends` означал в
 * PostgreSQL «друзья и все, кто позвал или кого позвали», а в памяти —
 * «принятые дружбы». Одно поле, два разных смысла: расхождение появилось в
 * 013 и не проявлялось, пока на этом поле ничего не решалось (SEC-012).
 */
const USER_SELECT = `
  SELECT
    u.id, u.name, u.email, u.avatar_url, u.city, u.interests, u.created_at,
    COALESCE(friends.ids, '{}') AS friend_ids
  FROM users u
  LEFT JOIN LATERAL (
    SELECT array_agg(
      CASE WHEN f.user_id = u.id THEN f.friend_id ELSE f.user_id END
      ORDER BY f.created_at
    ) AS ids
    FROM friendships f
    WHERE (f.user_id = u.id OR f.friend_id = u.id) AND f.status = 'accepted'
  ) friends ON true
`;

/**
 * Приведение метки к сравнимому виду — точная копия `normalizeLabel` из feed.ts
 * (нижний регистр, ё → е, обрезка пробелов), только на SQL.
 *
 * Правила обязаны совпадать: порядок ленты — это тройка (совпадение с
 * интересами, created_at, id), и первое поле считается ДВАЖДЫ — здесь для
 * сортировки и в JS для курсора следующей страницы. Пока SQL нормализовал
 * слабее, значения расходились, и курсор с rank=1 против строк с rank=0
 * пропускал условие `<` целиком: вторая страница начиналась заново с самого
 * свежего события, и лента зацикливалась. Достаточно было интереса «Кёрлинг»
 * при категории «Керлинг».
 */
function normalizedLabel(expression: string): string {
  return `translate(lower(btrim(${expression})), 'ё', 'е')`;
}

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
    endsAt: row.ends_at ? toIso(row.ends_at) : undefined,
    timezone: row.timezone,
    location: row.location,
    category: row.category ?? undefined,
    author: row.author_name,
    authorId: row.author_id,
    participants: participantIds.length,
    participantLimit: row.participant_limit ?? undefined,
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
    city: row.city ?? undefined,
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
    editedAt: row.edited_at ? toIso(row.edited_at) : undefined,
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

const INVITATION_SELECT = `
  SELECT id, event_id, token_hash, created_by, created_at, expires_at,
         max_uses, used_count, revoked_at
  FROM event_invitations
`;

function mapInvitation(row: InvitationRow): EventInvitation {
  return {
    id: row.id,
    eventId: row.event_id,
    tokenHash: row.token_hash,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    expiresAt: row.expires_at ? toIso(row.expires_at) : undefined,
    maxUses: row.max_uses ?? undefined,
    usedCount: row.used_count,
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : undefined,
  };
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    eventId: row.event_id ?? undefined,
    eventTitle: row.event_title ?? undefined,
    actorId: row.actor_id ?? undefined,
    actorName: row.actor_name ?? undefined,
    changes: row.changes?.length ? row.changes : undefined,
    createdAt: toIso(row.created_at),
    readAt: row.read_at ? toIso(row.read_at) : undefined,
  };
}

function canonicalFriendship(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

interface DirectMessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  created_at: Date | string;
  edited_at: Date | string | null;
  read_at: Date | string | null;
}

const MESSAGE_SELECT = `
  SELECT id, sender_id, recipient_id, text, created_at, edited_at, read_at
  FROM direct_messages
`;

/**
 * Строка списка диалогов: последняя реплика и собеседник в одном ответе.
 * `created_at` у них разные, поэтому пользовательская переименована — иначе
 * одна колонка молча затёрла бы другую.
 */
interface DialogRow extends DirectMessageRow, Omit<UserRow, "id" | "created_at"> {
  unread: number;
  peer_id: string;
  user_created_at: Date | string;
}

function mapDirectMessage(row: DirectMessageRow): DirectMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    text: row.text,
    createdAt: toIso(row.created_at),
    editedAt: row.edited_at ? toIso(row.edited_at) : undefined,
    readAt: row.read_at ? toIso(row.read_at) : undefined,
  };
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

  async ping(): Promise<boolean> {
    // Проверяем и доступность БД, и что таблица миграций существует (миграции применены).
    await this.pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
    return true;
  }

  /**
   * Выполняет составную операцию в одной транзакции (BE-004).
   *
   * Раньше такие операции шли отдельными запросами через пул: между проверкой
   * («событие существует?») и записью состояние могло измениться, а частичный
   * результат оставался в базе. Здесь всё выполняется на одном соединении и
   * откатывается целиком при любой ошибке.
   */
  private async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      // Откат не должен подменять исходную ошибку, поэтому его сбои гасим.
      await client.query("ROLLBACK").catch(() => {});
      throw error;
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
      /**
       * Полнотекстовый поиск с русской морфологией (BE-012).
       *
       * `ILIKE '%слово%'` совпадал только по точной подстроке: «концерты» не
       * находились по «концерт», а «встречу» — по «встреча». Здесь работает
       * стемминг, поэтому форма слова перестала иметь значение.
       *
       * `websearch_to_tsquery` выбран за то, что не бросает исключение на
       * произвольном пользовательском вводе — в отличие от `to_tsquery`,
       * которому достаточно одинокой скобки.
       *
       * `ILIKE` остался рядом как запасной путь: он ловит совпадение по началу
       * слова, пока пользователь ещё дописывает запрос («конц» → «концерт»),
       * чего полнотекстовый индекс без префиксного запроса не делает.
       */
      values.push(filters.search, `%${filters.search}%`);
      const query = `$${values.length - 1}`;
      const like = `$${values.length}`;
      conditions.push(
        `(e.search_vector @@ websearch_to_tsquery('russian', ${query})
          OR e.title ILIKE ${like}
          OR e.location ILIKE ${like})`,
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
    if (filters.favoritedBy) {
      add(
        "EXISTS (SELECT 1 FROM event_favorites fav WHERE fav.event_id = e.id AND fav.user_id = ?)",
        filters.favoritedBy,
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

    /**
     * Совпадение с интересами зрителя — выражение, участвующее и в сортировке,
     * и в сравнении с курсором. Значение 1/0, а не `true`/`false`: так сравнение
     * кортежей с курсором читается однозначнее.
     *
     * Когда интересов нет, выражение не добавляется вовсе. Подставлять вместо
     * него константу нельзя: `ORDER BY 0` PostgreSQL читает как номер колонки в
     * списке выборки, а нулевой колонки не бывает. Заодно запрос остаётся ровно
     * тем, под который заведён индекс `(created_at DESC, id DESC)`.
     */
    let interestRank: string | undefined;
    if (filters.preferInterests?.length) {
      values.push(filters.preferInterests);
      const wanted = `SELECT ${normalizedLabel("interest")} FROM unnest($${values.length}::text[]) AS interest`;
      interestRank = `(CASE WHEN ${normalizedLabel("coalesce(e.category, '')")} = ANY(${wanted}) OR EXISTS (
        SELECT 1 FROM unnest(e.tags) AS tag WHERE ${normalizedLabel("tag")} = ANY(${wanted})
      ) THEN 1 ELSE 0 END)`;
    }

    // Постраничная выдача — только для ленты (без явной сортировки по дате начала).
    if (!filters.sort && filters.cursor) {
      // Сравнение кортежей вместо цепочки OR: так условие точно совпадает с
      // порядком сортировки и не пропускает записи на границе страниц.
      if (interestRank) {
        values.push(
          filters.cursor.matchesInterests ? 1 : 0,
          filters.cursor.createdAt,
          filters.cursor.id,
        );
        conditions.push(
          `(${interestRank}, e.created_at, e.id) < ($${values.length - 2}, $${values.length - 1}, $${values.length})`,
        );
      } else {
        values.push(filters.cursor.createdAt, filters.cursor.id);
        conditions.push(`(e.created_at, e.id) < ($${values.length - 1}, $${values.length})`);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const feedOrder = interestRank
      ? `${interestRank} DESC, e.created_at DESC, e.id DESC`
      : "e.created_at DESC, e.id DESC";
    const order = filters.sort
      ? `ORDER BY e.starts_at ${filters.sort === "asc" ? "ASC" : "DESC"}, e.id DESC`
      : `ORDER BY ${feedOrder}`;

    let limit = "";
    if (filters.limit !== undefined) {
      values.push(filters.limit);
      limit = `LIMIT $${values.length}`;
    }

    const result = await this.pool.query<EventRow>(
      `${EVENT_SELECT} ${where} ${order} ${limit}`,
      values,
    );
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
          image_url, tags, latitude, longitude, visibility, created_at,
          ends_at, participant_limit
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
          event.endsAt ?? null,
          event.participantLimit ?? null,
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
    // Чтение и запись — в одной транзакции с блокировкой строки: иначе два
    // одновременных обновления читали бы одно состояние и одно из них терялось.
    return this.withTransaction(async (client) => {
      const locked = await client.query("SELECT 1 FROM events WHERE id = $1 FOR UPDATE", [id]);
      if ((locked.rowCount ?? 0) === 0) return undefined;

      const currentRow = await client.query<EventRow>(`${EVENT_SELECT} WHERE e.id = $1`, [id]);
      const current = currentRow.rows[0] ? mapEvent(currentRow.rows[0]) : undefined;
      if (!current) return undefined;

      const next = { ...current, ...patch, id };
      await client.query(
        `UPDATE events SET
        title = $2, description = $3, starts_at = $4, timezone = $5, location = $6,
        category = $7, author_id = $8, image_url = $9, tags = $10,
        latitude = $11, longitude = $12, visibility = $13,
        ends_at = $14, participant_limit = $15
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
          next.endsAt ?? null,
          next.participantLimit ?? null,
        ],
      );

      const updated = await client.query<EventRow>(`${EVENT_SELECT} WHERE e.id = $1`, [id]);
      return updated.rows[0] ? mapEvent(updated.rows[0]) : undefined;
    });
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM events WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async joinEvent(eventId: string, userId: string): Promise<JoinEventResult> {
    /**
     * Блокировка строки события — `FOR UPDATE`, а не `FOR SHARE` (BE-007).
     *
     * `FOR SHARE` пускает читателей одновременно: двое, нажавших «Присоединиться»
     * на последнее место, оба увидели бы «занято 4 из 5» и оба записались бы.
     * `FOR UPDATE` выстраивает их в очередь, поэтому второй считает уже 5 и
     * получит отказ. Конкурентное удаление события тоже подождёт, как и раньше.
     *
     * Ждать приходится только тем, кто записывается на одно и то же событие.
     */
    const outcome = await this.withTransaction(async (client) => {
      const locked = await client.query<{ participant_limit: number | null }>(
        "SELECT participant_limit FROM events WHERE id = $1 FOR UPDATE",
        [eventId],
      );
      if ((locked.rowCount ?? 0) === 0) return "not-found" as const;

      const already = await client.query(
        "SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2",
        [eventId, userId],
      );
      if ((already.rowCount ?? 0) > 0) return "already-joined" as const;

      const limit = locked.rows[0]?.participant_limit;
      if (limit !== null && limit !== undefined) {
        const taken = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM event_participants WHERE event_id = $1",
          [eventId],
        );
        if (Number(taken.rows[0]?.count ?? 0) >= limit) return "full" as const;
      }

      await client.query(
        `INSERT INTO event_participants (event_id, user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [eventId, userId],
      );
      return "joined" as const;
    });

    if (outcome === "not-found") return { outcome };
    const event = await this.getEvent(eventId);
    // Событие могли удалить между транзакцией и чтением — тогда ответ честнее
    // свести к «не найдено», чем возвращать участие в исчезнувшем событии.
    return event ? { outcome, event } : { outcome: "not-found" };
  }

  async createInvitation(invitation: EventInvitation): Promise<void> {
    await this.pool.query(
      `INSERT INTO event_invitations
         (id, event_id, token_hash, created_by, created_at, expires_at, max_uses, used_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        invitation.id,
        invitation.eventId,
        invitation.tokenHash,
        invitation.createdBy,
        invitation.createdAt,
        invitation.expiresAt ?? null,
        invitation.maxUses ?? null,
        invitation.usedCount,
      ],
    );
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<EventInvitation | undefined> {
    const result = await this.pool.query<InvitationRow>(
      `${INVITATION_SELECT} WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? mapInvitation(result.rows[0]) : undefined;
  }

  async consumeInvitation(id: string): Promise<boolean> {
    // Условие в самом UPDATE, а не проверкой перед ним: иначе два одновременных
    // перехода по приглашению с `max_uses = 1` оба увидели бы «ещё не исчерпано».
    const result = await this.pool.query(
      `UPDATE event_invitations
          SET used_count = used_count + 1
        WHERE id = $1
          AND revoked_at IS NULL
          AND (max_uses IS NULL OR used_count < max_uses)`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listInvitations(eventId: string): Promise<EventInvitation[]> {
    const result = await this.pool.query<InvitationRow>(
      `${INVITATION_SELECT} WHERE event_id = $1 ORDER BY created_at DESC`,
      [eventId],
    );
    return result.rows.map(mapInvitation);
  }

  async revokeInvitation(id: string, revokedAt: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE event_invitations SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL",
      [id, revokedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async leaveEvent(eventId: string, userId: string): Promise<Event | undefined> {
    const left = await this.withTransaction(async (client) => {
      const exists = await client.query("SELECT 1 FROM events WHERE id = $1 FOR SHARE", [eventId]);
      if ((exists.rowCount ?? 0) === 0) return false;
      await client.query("DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2", [
        eventId,
        userId,
      ]);
      return true;
    });
    return left ? this.getEvent(eventId) : undefined;
  }

  async addFavorite(userId: string, eventId: string): Promise<boolean> {
    // ON CONFLICT DO NOTHING по первичному ключу (user_id, event_id): повторное
    // нажатие не ошибка и не дубль даже при одновременных запросах.
    const result = await this.pool.query(
      `INSERT INTO event_favorites (user_id, event_id)
       SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM events WHERE id = $2)
       ON CONFLICT DO NOTHING`,
      [userId, eventId],
    );
    // Вставки могло не быть по двум причинам: событие отсутствует или отметка
    // уже стоит. Различаем их отдельной проверкой, чтобы не отвечать 404 на
    // повторное нажатие.
    if ((result.rowCount ?? 0) > 0) return true;
    return this.eventExists(eventId);
  }

  async removeFavorite(userId: string, eventId: string): Promise<boolean> {
    await this.pool.query("DELETE FROM event_favorites WHERE user_id = $1 AND event_id = $2", [
      userId,
      eventId,
    ]);
    return this.eventExists(eventId);
  }

  private async eventExists(eventId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM events WHERE id = $1", [eventId]);
    return (result.rowCount ?? 0) > 0;
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
      `INSERT INTO users (id, name, email, avatar_url, city, interests, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         avatar_url = EXCLUDED.avatar_url,
         city = EXCLUDED.city,
         interests = EXCLUDED.interests`,
      [
        user.id,
        user.name,
        user.email,
        user.avatar ?? null,
        user.city ?? null,
        user.interests ?? [],
        user.createdAt,
      ],
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
    // Проверка владения и удаление — атомарно. Дополнительно это выравнивает
    // поведение адаптеров: раньше PostgreSQL бросал ошибку внешнего ключа (23503),
    // а in-memory возвращал false. Теперь оба возвращают false.
    return this.withTransaction(async (client) => {
      const owns = await client.query(
        `SELECT 1
         WHERE EXISTS (SELECT 1 FROM events WHERE author_id = $1)
            OR EXISTS (SELECT 1 FROM comments WHERE author_id = $1)`,
        [id],
      );
      if ((owns.rowCount ?? 0) > 0) return false;

      const deleted = await client.query("DELETE FROM users WHERE id = $1", [id]);
      return (deleted.rowCount ?? 0) > 0;
    });
  }

  async listFriends(userId: string): Promise<User[] | undefined> {
    if (!(await this.getUser(userId))) return undefined;
    const result = await this.pool.query<UserRow>(
      `${USER_SELECT}
       WHERE u.id IN (
         SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
         FROM friendships f
         WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
       )
       ORDER BY u.name`,
      [userId],
    );
    return result.rows.map(mapUser);
  }

  /**
   * Блокирует обе строки пользователей строго в каноническом (отсортированном)
   * порядке. Разный порядок блокировок во встречных вызовах `add(a, b)` и
   * `add(b, a)` мог бы привести к взаимной блокировке.
   */
  private async lockUserPair(client: PoolClient, left: string, right: string): Promise<boolean> {
    for (const id of [left, right]) {
      const found = await client.query("SELECT 1 FROM users WHERE id = $1 FOR SHARE", [id]);
      if ((found.rowCount ?? 0) === 0) return false;
    }
    return true;
  }

  async requestFriendship(userId: string, friendId: string): Promise<FriendshipOutcome> {
    if (userId === friendId) return "self";
    const [left, right] = canonicalFriendship(userId, friendId);
    return this.withTransaction(async (client) => {
      if (!(await this.lockUserPair(client, left, right))) return "not-found";

      // Строку связи тоже блокируем: два встречных «добавить в друзья»
      // одновременно иначе оба увидели бы пустоту и вставили бы по заявке.
      const existing = await client.query<{ status: string; requested_by: string | null }>(
        "SELECT status, requested_by FROM friendships WHERE user_id = $1 AND friend_id = $2 FOR UPDATE",
        [left, right],
      );

      const current = existing.rows[0];
      if (current) {
        if (current.status === "accepted") return "already-friends";
        // Встречная заявка — принимаем её: согласие и есть «добавить в друзья».
        if (current.requested_by !== userId) {
          await client.query(
            `UPDATE friendships SET status = 'accepted', responded_at = now()
             WHERE user_id = $1 AND friend_id = $2`,
            [left, right],
          );
          return "accepted";
        }
        return "already-requested";
      }

      await client.query(
        `INSERT INTO friendships (user_id, friend_id, status, requested_by)
         VALUES ($1, $2, 'pending', $3)`,
        [left, right, userId],
      );
      return "requested";
    });
  }

  async listFriendRequests(userId: string): Promise<FriendRequests | undefined> {
    if (!(await this.getUser(userId))) return undefined;
    const counterpart = "CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END";
    const [incoming, outgoing] = await Promise.all([
      this.pool.query<UserRow>(
        `${USER_SELECT}
         WHERE u.id IN (
           SELECT ${counterpart} FROM friendships f
           WHERE (f.user_id = $1 OR f.friend_id = $1)
             AND f.status = 'pending' AND f.requested_by <> $1
         )
         ORDER BY u.name`,
        [userId],
      ),
      this.pool.query<UserRow>(
        `${USER_SELECT}
         WHERE u.id IN (
           SELECT ${counterpart} FROM friendships f
           WHERE (f.user_id = $1 OR f.friend_id = $1)
             AND f.status = 'pending' AND f.requested_by = $1
         )
         ORDER BY u.name`,
        [userId],
      ),
    ]);
    return { incoming: incoming.rows.map(mapUser), outgoing: outgoing.rows.map(mapUser) };
  }

  async acceptFriendRequest(userId: string, requesterId: string): Promise<boolean> {
    if (userId === requesterId) return false;
    const [left, right] = canonicalFriendship(userId, requesterId);
    // Условие принятия целиком внутри UPDATE: проверять отдельным SELECT значило
    // бы оставить окно, в котором заявку успевают отозвать.
    const result = await this.pool.query(
      `UPDATE friendships SET status = 'accepted', responded_at = now()
       WHERE user_id = $1 AND friend_id = $2 AND status = 'pending' AND requested_by = $3`,
      [left, right, requesterId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean | undefined> {
    const [left, right] = canonicalFriendship(userId, friendId);
    return this.withTransaction(async (client) => {
      if (!(await this.lockUserPair(client, left, right))) return undefined;
      const result = await client.query(
        "DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2",
        [left, right],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async areFriends(userId: string, peerId: string): Promise<boolean> {
    if (userId === peerId) return false;
    const [left, right] = canonicalFriendship(userId, peerId);
    const result = await this.pool.query(
      "SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'",
      [left, right],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async sendDirectMessage(input: CreateMessageInput): Promise<SendMessageResult> {
    if (input.senderId === input.recipientId) return { outcome: "not-allowed" };
    const [left, right] = canonicalFriendship(input.senderId, input.recipientId);

    return this.withTransaction(async (client) => {
      /*
       * Проверка дружбы и вставка — одна транзакция.
       *
       * Разделив их, мы оставили бы окно между двумя `await`, в котором дружбу
       * успевают расторгнуть: сообщение ушло бы человеку, который только что
       * закрыл к себе доступ. `FOR SHARE` держит строку связи до конца
       * транзакции, не мешая другим читателям (BE-004).
       */
      const friendship = await client.query(
        `SELECT 1 FROM friendships
          WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'
          FOR SHARE`,
        [left, right],
      );
      if ((friendship.rowCount ?? 0) === 0) return { outcome: "not-allowed" as const };

      // Уведомление шлётся только о первом непрочитанном: иначе активная
      // переписка вытеснит из колокольчика приглашения, отмены и комментарии.
      const pending = await client.query<{ had_unread: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM direct_messages
            WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL
         ) AS had_unread`,
        [input.senderId, input.recipientId],
      );

      const inserted = await client.query<DirectMessageRow>(
        `INSERT INTO direct_messages
           (id, thread_key, sender_id, recipient_id, text, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sender_id, recipient_id, text, created_at, edited_at, read_at`,
        [
          input.id,
          threadKey(input.senderId, input.recipientId),
          input.senderId,
          input.recipientId,
          input.text,
          input.createdAt,
        ],
      );

      return {
        outcome: "sent" as const,
        message: mapDirectMessage(inserted.rows[0]!),
        firstUnread: !pending.rows[0]?.had_unread,
      };
    });
  }

  async getDirectMessage(id: string): Promise<DirectMessage | undefined> {
    const result = await this.pool.query<DirectMessageRow>(`${MESSAGE_SELECT} WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? mapDirectMessage(row) : undefined;
  }

  async updateDirectMessage(
    id: string,
    senderId: string,
    text: string,
    editedAt: string,
  ): Promise<DirectMessage | undefined> {
    /*
     * Авторство и дружба — часть условия UPDATE, а не отдельная проверка перед
     * ним. Проверка снаружи оставила бы окно между двумя запросами, а главное —
     * её легко забыть: ровно так правка и оказалась лазейкой в обход
     * расторжения дружбы (BE-004, PROD-011).
     *
     * `friendships` хранит пару в каноническом порядке, поэтому сравнение идёт
     * с least/greatest, а не с двумя вариантами.
     */
    const result = await this.pool.query<DirectMessageRow>(
      `UPDATE direct_messages m
          SET text = $3, edited_at = $4
        WHERE m.id = $1
          AND m.sender_id = $2
          AND EXISTS (
            SELECT 1 FROM friendships f
             WHERE f.user_id = least(m.sender_id, m.recipient_id)
               AND f.friend_id = greatest(m.sender_id, m.recipient_id)
               AND f.status = 'accepted'
          )
        RETURNING m.id, m.sender_id, m.recipient_id, m.text, m.created_at, m.edited_at, m.read_at`,
      [id, senderId, text, editedAt],
    );
    const row = result.rows[0];
    return row ? mapDirectMessage(row) : undefined;
  }

  async deleteDirectMessage(id: string, senderId: string): Promise<boolean> {
    // Дружба не нужна: убрать собственный текст — действие в пользу приватности.
    const result = await this.pool.query(
      "DELETE FROM direct_messages WHERE id = $1 AND sender_id = $2",
      [id, senderId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listDirectMessages(
    userId: string,
    peerId: string,
    filters: MessageThreadFilters,
  ): Promise<DirectMessage[]> {
    const parameters: unknown[] = [threadKey(userId, peerId)];
    let keyset = "";
    if (filters.cursor) {
      // Кортеж дословно повторяет ORDER BY ниже. Разойдутся — keyset перестанет
      // читаться из индекса и начнёт терять записи на границе страниц.
      parameters.push(filters.cursor.createdAt, filters.cursor.id);
      keyset = " AND (created_at, id) < ($2::timestamptz, $3)";
    }
    parameters.push(filters.limit);

    const result = await this.pool.query<DirectMessageRow>(
      `${MESSAGE_SELECT}
        WHERE thread_key = $1${keyset}
        ORDER BY created_at DESC, id DESC
        LIMIT $${parameters.length}`,
      parameters,
    );
    return result.rows.map(mapDirectMessage);
  }

  async listDialogs(userId: string, limit: number): Promise<Dialog[]> {
    /*
     * Собеседник читается тем же `USER_SELECT`, что и везде. Свой SELECT здесь
     * означал бы третье место, где перечислены поля пользователя, — так уже
     * разъехался `mapComment`, где у автора потерялся город.
     */
    const result = await this.pool.query<DialogRow>(
      `WITH mine AS (
         SELECT m.*, CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS peer_id
           FROM direct_messages m
          WHERE m.sender_id = $1 OR m.recipient_id = $1
       ), last AS (
         SELECT DISTINCT ON (peer_id) *
           FROM mine
          ORDER BY peer_id, created_at DESC, id DESC
       ), unread AS (
         SELECT peer_id, count(*)::int AS unread
           FROM mine
          WHERE recipient_id = $1 AND read_at IS NULL
          GROUP BY peer_id
       )
       SELECT last.id, last.sender_id, last.recipient_id, last.text,
              last.created_at, last.edited_at, last.read_at,
              COALESCE(unread.unread, 0) AS unread,
              peer.id AS peer_id, peer.name, peer.email, peer.avatar_url,
              peer.city, peer.interests, peer.created_at AS user_created_at,
              peer.friend_ids
         FROM last
         JOIN (${USER_SELECT}) peer ON peer.id = last.peer_id
         LEFT JOIN unread ON unread.peer_id = last.peer_id
        ORDER BY last.created_at DESC, last.id DESC
        LIMIT $2`,
      [userId, limit],
    );

    return result.rows.map((row) => ({
      peer: mapUser({ ...row, id: row.peer_id, created_at: row.user_created_at }),
      lastMessage: mapDirectMessage(row),
      unread: row.unread,
    }));
  }

  async countUnreadDirectMessages(userId: string): Promise<number> {
    const result = await this.pool.query<{ unread: number }>(
      "SELECT count(*)::int AS unread FROM direct_messages WHERE recipient_id = $1 AND read_at IS NULL",
      [userId],
    );
    return result.rows[0]?.unread ?? 0;
  }

  async markDirectMessagesRead(userId: string, peerId: string, readAt: string): Promise<number> {
    // «Своё/чужое» зашито в условие, а не проверяется отдельным SELECT: пометить
    // прочитанными чужие сообщения нельзя даже подставив идентификатор.
    const result = await this.pool.query(
      `UPDATE direct_messages SET read_at = $3
        WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [userId, peerId, readAt],
    );
    return result.rowCount ?? 0;
  }

  async listComments(eventId: string): Promise<Comment[]> {
    const result = await this.pool.query<CommentRow>(
      `SELECT
         c.id, c.text, c.event_id, c.created_at, c.edited_at,
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
         c.id, c.text, c.event_id, c.created_at, c.edited_at,
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

  async updateComment(id: string, text: string, editedAt: string): Promise<Comment | undefined> {
    const updated = await this.pool.query(
      "UPDATE comments SET text = $2, edited_at = $3 WHERE id = $1",
      [id, text, editedAt],
    );
    if ((updated.rowCount ?? 0) === 0) return undefined;
    return this.getComment(id);
  }

  async deleteComment(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM comments WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async createNotifications(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;
    // Одна вставка на всю пачку: рассылка участникам события — самый частый случай,
    // и по запросу на получателя это был бы десяток round-trip'ов на одно действие.
    const values: unknown[] = [];
    const rows = notifications.map((item, index) => {
      const base = index * 9;
      values.push(
        item.id,
        item.userId,
        item.type,
        item.eventId ?? null,
        // У уведомления о личном сообщении события нет — колонка стала
        // необязательной в миграции 014.
        item.eventTitle ?? null,
        item.actorId ?? null,
        item.actorName ?? null,
        item.changes ?? [],
        item.createdAt,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
    });
    await this.pool.query(
      `INSERT INTO notifications
         (id, user_id, type, event_id, event_title, actor_id, actor_name, changes, created_at)
       VALUES ${rows.join(", ")}`,
      values,
    );
  }

  async listNotifications(userId: string, limit: number): Promise<Notification[]> {
    const result = await this.pool.query<NotificationRow>(
      `SELECT id, user_id, type, event_id, event_title, actor_id, actor_name, changes,
              created_at, read_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map(mapNotification);
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async markNotificationsRead(userId: string, readAt: string, ids?: string[]): Promise<number> {
    // `ids IS NULL` в условии позволяет обойтись одним запросом на оба сценария:
    // «прочитать всё» и «прочитать выбранные».
    const result = await this.pool.query(
      `UPDATE notifications
          SET read_at = $2
        WHERE user_id = $1
          AND read_at IS NULL
          AND ($3::text[] IS NULL OR id = ANY($3))`,
      [userId, readAt, ids ?? null],
    );
    return result.rowCount ?? 0;
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

  async deleteExpiredSessions(now: string): Promise<number> {
    const result = await this.pool.query(
      "DELETE FROM auth_sessions WHERE expires_at <= $1 OR revoked_at IS NOT NULL",
      [now],
    );
    return result.rowCount ?? 0;
  }

  async revokeUserSessions(userId: string, revokedAt: string): Promise<number> {
    const result = await this.pool.query(
      "UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL",
      [userId, revokedAt],
    );
    return result.rowCount ?? 0;
  }

  async createPasswordResetToken(token: PasswordResetToken): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [token.id, token.userId, token.tokenHash, token.createdAt, token.expiresAt],
    );
  }

  async getPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const result = await this.pool.query<PasswordResetTokenRow>(
      `SELECT id, user_id, token_hash, created_at, expires_at, used_at
         FROM password_reset_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      createdAt: toIso(row.created_at),
      expiresAt: toIso(row.expires_at),
      usedAt: row.used_at ? toIso(row.used_at) : undefined,
    };
  }

  async consumePasswordResetToken(id: string, usedAt: string): Promise<boolean> {
    // Условие в самом UPDATE: два одновременных перехода по одной ссылке иначе
    // оба увидели бы «ещё не использована».
    const result = await this.pool.query(
      "UPDATE password_reset_tokens SET used_at = $2 WHERE id = $1 AND used_at IS NULL",
      [id, usedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteExpiredPasswordResetTokens(now: string): Promise<number> {
    const result = await this.pool.query(
      "DELETE FROM password_reset_tokens WHERE expires_at <= $1 OR used_at IS NOT NULL",
      [now],
    );
    return result.rowCount ?? 0;
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
      logger.info(`[db] нормализованные таблицы заполнены из ${sourceLabel}`);
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
