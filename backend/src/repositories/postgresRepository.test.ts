import assert from "node:assert/strict";
import test from "node:test";
import { runDirectMessageConformance } from "./directMessages.conformance.js";

/**
 * Интеграционные тесты PostgreSQL-адаптера (QA-006).
 *
 * До этого весь backend тестировался только на in-memory хранилище, а в production
 * работает `PostgresRepository` — то есть SQL, миграции и конкурентные операции
 * не проверялись автоматически вовсе.
 *
 * Набор запускается против реальной базы, если задан `TEST_DATABASE_URL`
 * (в CI поднимается сервис-контейнер PostgreSQL). Без него тесты пропускаются,
 * чтобы локальный `npm run check` не требовал Docker.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const skip = DATABASE_URL ? false : "TEST_DATABASE_URL не задан — интеграционные тесты пропущены";

// Конфиг читается при первом импорте, поэтому окружение готовим до динамических импортов.
process.env.DATABASE_URL = DATABASE_URL;
process.env.DATABASE_SSL = "false";
process.env.PERSIST = "false";
process.env.NODE_ENV = "test";
process.env.ENABLE_EXTERNAL_EVENTS = "false";

/** Таблицы, которые чистим между тестами. `schema_migrations` намеренно сохраняем. */
const TABLES = [
  "app_metadata",
  "notifications",
  "direct_messages",
  "event_favorites",
  "auth_sessions",
  "password_credentials",
  "external_identities",
  "comments",
  "event_participants",
  "friendships",
  "events",
  "users",
];

type Repo = import("./repository.js").PovodRepository;

/**
 * Возвращает репозиторий с чистой, заново засеянной базой: чистим таблицы
 * (включая маркер bootstrap в `app_metadata`) и заново прогоняем `init()`.
 */
async function freshRepository(): Promise<Repo> {
  const [{ getPool }, { PostgresRepository }] = await Promise.all([
    import("../db/pg.js"),
    import("./postgresRepository.js"),
  ]);
  const pool = getPool();
  const repository = new PostgresRepository(pool);
  // Миграции идемпотентны: первый init создаёт схему, дальше только досоздаёт недостающее.
  await repository.init();
  await pool.query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  const reseeded = new PostgresRepository(pool);
  await reseeded.init();
  return reseeded;
}

test("migrations create the full schema and are recorded", { skip }, async () => {
  const [{ getPool }] = await Promise.all([import("../db/pg.js")]);
  await freshRepository();
  const pool = getPool();

  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const names = tables.rows.map((row) => row.table_name);
  for (const expected of TABLES) {
    assert.ok(names.includes(expected), `таблица ${expected} должна существовать`);
  }

  const applied = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  assert.ok(applied.rows.length >= 5, "должны быть применены все нумерованные миграции");
  assert.ok(
    applied.rows.some((row) => row.version.startsWith("004")),
    "миграция 004 (индекс очистки сессий) должна быть применена",
  );
  assert.ok(
    applied.rows.some((row) => row.version.startsWith("005")),
    "миграция 005 (индекс сортировки ленты) должна быть применена",
  );
  assert.ok(
    applied.rows.some((row) => row.version.startsWith("006")),
    "миграция 006 (город пользователя) должна быть применена",
  );
  assert.ok(
    applied.rows.some((row) => row.version.startsWith("007")),
    "миграция 007 (уведомления) должна быть применена",
  );
  assert.ok(
    applied.rows.some((row) => row.version.startsWith("008")),
    "миграция 008 (избранное) должна быть применена",
  );

  const userColumns = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'`,
  );
  assert.ok(
    userColumns.rows.some((row) => row.column_name === "city"),
    "у пользователей должна быть колонка city (BE-010)",
  );

  const indexes = await pool.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
  );
  const indexNames = indexes.rows.map((row) => row.indexname);
  for (const expected of [
    "events_created_at_idx",
    "auth_sessions_expires_at_idx",
    "users_email_lower_idx",
    "notifications_user_created_idx",
    "notifications_user_unread_idx",
  ]) {
    assert.ok(indexNames.includes(expected), `индекс ${expected} должен существовать`);
  }
});

test("notifications: batch insert, feed order and unread counting", { skip }, async () => {
  const repository = await freshRepository();
  const base = {
    userId: "u1",
    type: "event_joined" as const,
    eventId: "1",
    eventTitle: "Пляжный волейбол",
    actorId: "u2",
    actorName: "Марк",
  };

  await repository.createNotifications([
    { ...base, id: "n1", createdAt: "2026-07-01T10:00:00.000Z" },
    { ...base, id: "n2", createdAt: "2026-07-02T10:00:00.000Z" },
    // Чужое уведомление: в ленту u1 попасть не должно.
    { ...base, id: "n3", userId: "u3", createdAt: "2026-07-03T10:00:00.000Z" },
  ]);

  const feed = await repository.listNotifications("u1", 50);
  assert.deepEqual(
    feed.map((item) => item.id),
    ["n2", "n1"],
    "лента отдаётся свежими вперёд",
  );
  assert.equal(await repository.countUnreadNotifications("u1"), 2);

  const readAt = "2026-07-04T10:00:00.000Z";
  assert.equal(await repository.markNotificationsRead("u1", readAt, ["n1"]), 1);
  assert.equal(await repository.countUnreadNotifications("u1"), 1);
  // Повторное чтение уже прочитанного ничего не меняет.
  assert.equal(await repository.markNotificationsRead("u1", readAt, ["n1"]), 0);

  // Чужое уведомление нельзя пометить, даже зная его идентификатор.
  assert.equal(await repository.markNotificationsRead("u1", readAt, ["n3"]), 0);
  assert.equal(await repository.countUnreadNotifications("u3"), 1);

  assert.equal(await repository.markNotificationsRead("u1", readAt), 1, "без ids читается всё");
  assert.equal(await repository.countUnreadNotifications("u1"), 0);
});

test("notifications survive the deletion of what they refer to", { skip }, async () => {
  const repository = await freshRepository();
  await repository.createNotifications([
    {
      id: "n-link",
      userId: "u1",
      type: "event_comment",
      eventId: "2",
      eventTitle: "Вечернее караоке",
      actorId: "u3",
      actorName: "Тимур",
      createdAt: "2026-07-01T10:00:00.000Z",
    },
  ]);

  await repository.deleteEvent("2");

  const [notification] = await repository.listNotifications("u1", 50);
  assert.ok(notification, "удаление события не должно уносить уведомление о нём");
  // ON DELETE SET NULL: ссылка исчезла, а название и имя остались — прочитать
  // их из удалённых строк было бы уже негде.
  assert.equal(notification.eventId, undefined);
  assert.equal(notification.eventTitle, "Вечернее караоке");
  assert.equal(notification.actorName, "Тимур");
});

test(
  "favorites: concurrent adds produce no duplicate and deletion cascades",
  { skip },
  async () => {
    const repository = await freshRepository();
    const [{ getPool }] = await Promise.all([import("../db/pg.js")]);

    // Десять одновременных нажатий: первичный ключ по паре плюс ON CONFLICT
    // DO NOTHING не дают появиться дублю даже при гонке.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repository.addFavorite("u1", "2")),
    );
    assert.ok(results.every(Boolean));

    const rows = await getPool().query<{ count: string }>(
      "SELECT count(*)::text AS count FROM event_favorites WHERE user_id = $1",
      ["u1"],
    );
    assert.equal(rows.rows[0]?.count, "1");

    assert.deepEqual(
      (await repository.listEvents({ favoritedBy: "u1", viewerId: "u1" })).map((event) => event.id),
      ["2"],
    );

    // Несуществующее событие отличается от повторного нажатия.
    assert.equal(await repository.addFavorite("u1", "does-not-exist"), false);
    assert.equal(await repository.removeFavorite("u1", "does-not-exist"), false);

    await repository.deleteEvent("2");
    assert.deepEqual(await repository.listEvents({ favoritedBy: "u1", viewerId: "u1" }), []);
  },
);

test("full-text search matches a different word form (BE-012)", { skip }, async () => {
  const repository = await freshRepository();
  await repository.createEvent({
    id: "fts-1",
    title: "Большие концерты",
    description: "Играем вживую",
    startsAt: "2026-08-01T12:00:00.000Z",
    timezone: "Europe/Moscow",
    location: "Клубы города",
    author: "Эльмира",
    authorId: "u1",
    participants: 1,
    participantIds: ["u1"],
    createdAt: "2026-07-01T10:00:00.000Z",
  });

  // Прежний ILIKE '%концерт%' нашёл бы это по подстроке, а вот «концертами» —
  // уже нет. Морфология русского снимает вопрос формы слова.
  for (const query of ["концерт", "концертами", "клуб"]) {
    const found = await repository.listEvents({ search: query });
    assert.ok(
      found.some((event) => event.id === "fts-1"),
      `«${query}» должен находить событие`,
    );
  }

  // Одинокая скобка не должна ронять запрос: пользователь вводит что угодно.
  await assert.doesNotReject(() => repository.listEvents({ search: "конц( & !" }));
  assert.deepEqual(await repository.listEvents({ search: "бухгалтерия" }), []);
});

test("keyset pagination walks the whole feed exactly once (BE-003)", { skip }, async () => {
  const repository = await freshRepository();
  const [{ cursorOf }] = await Promise.all([import("../feed.js")]);

  // Одинаковая дата создания у нескольких событий — обычное дело при импорте.
  // Без сравнения по id страницы теряли бы или дублировали такие записи.
  for (let index = 0; index < 6; index += 1) {
    await repository.createEvent({
      id: `page-${index}`,
      title: `Событие ${index}`,
      description: "",
      startsAt: "2026-08-01T12:00:00.000Z",
      timezone: "Europe/Moscow",
      location: "",
      author: "Эльмира",
      authorId: "u1",
      participants: 1,
      participantIds: ["u1"],
      createdAt: "2026-07-01T10:00:00.000Z",
    });
  }

  const seen: string[] = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const items = await repository.listEvents({ limit: 2, cursor });
    if (items.length === 0) break;
    seen.push(...items.map((event) => event.id));
    cursor = cursorOf(items[items.length - 1], undefined);
  }

  assert.equal(new Set(seen).size, seen.length, "события не должны повторяться");
  assert.equal(seen.length, 9, "6 созданных + 3 сида");
});

test("interest ordering wins over freshness (BE-003)", { skip }, async () => {
  const repository = await freshRepository();
  await repository.createEvent({
    id: "match",
    title: "По интересу",
    description: "",
    startsAt: "2026-08-01T12:00:00.000Z",
    timezone: "Europe/Moscow",
    location: "",
    category: "Кёрлинг",
    author: "Эльмира",
    authorId: "u1",
    participants: 1,
    participantIds: ["u1"],
    createdAt: "2020-01-01T10:00:00.000Z", // намеренно самое старое
  });

  const ordered = await repository.listEvents({ preferInterests: ["кёрлинг"], limit: 10 });
  assert.equal(ordered[0]?.id, "match", "совпадение по интересу поднимается выше свежести");
});

test("seed data is imported into normalized tables", { skip }, async () => {
  const repository = await freshRepository();

  const users = await repository.listUsers();
  assert.deepEqual(
    users.map((user) => user.id).sort(),
    ["u1", "u2", "u3"],
    "сид-пользователи должны быть импортированы",
  );

  const events = await repository.listEvents();
  assert.deepEqual(events.map((event) => event.id).sort(), ["1", "2", "3"]);

  const comments = await repository.listComments("1");
  assert.deepEqual(comments.map((comment) => comment.id).sort(), ["c1", "c2"]);
});

test("ping succeeds against a migrated database (readiness probe)", { skip }, async () => {
  const repository = await freshRepository();
  assert.equal(await repository.ping(), true);
});

test("joining an event is idempotent and the count is derived", { skip }, async () => {
  const repository = await freshRepository();

  const first = await repository.joinEvent("2", "u1");
  const second = await repository.joinEvent("2", "u1");

  assert.equal(first.outcome, "joined");
  assert.equal(second.outcome, "already-joined");
  assert.deepEqual(second.event.participantIds.sort(), ["u1", "u2"]);
  assert.equal(second.event.participants, 2, "счётчик выводится из связей участия");

  const afterLeave = await repository.leaveEvent("2", "u1");
  assert.deepEqual(afterLeave?.participantIds, ["u2"]);
  assert.equal(afterLeave?.participants, 1);
});

test("joining a missing event is reported as such and inserts nothing", { skip }, async () => {
  const repository = await freshRepository();
  const [{ getPool }] = await Promise.all([import("../db/pg.js")]);

  assert.equal((await repository.joinEvent("does-not-exist", "u1")).outcome, "not-found");

  const rows = await getPool().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM event_participants WHERE event_id = $1",
    ["does-not-exist"],
  );
  assert.equal(rows.rows[0]?.count, "0");
});

test("concurrent joins stay consistent and do not double-count (BE-004)", { skip }, async () => {
  const repository = await freshRepository();

  // Десять одновременных записей одного и того же пользователя: транзакция с
  // блокировкой строки события не даёт появиться дублю или неверному счётчику.
  const results = await Promise.all(
    Array.from({ length: 10 }, () => repository.joinEvent("2", "u3")),
  );
  assert.ok(
    results.every((result) => result.outcome !== "not-found"),
    "все вызовы должны вернуть событие",
  );

  const event = await repository.getEvent("2");
  assert.deepEqual(event?.participantIds.sort(), ["u2", "u3"]);
  assert.equal(event?.participants, 2);
});

test("the participant limit holds under concurrent joins (BE-007)", { skip }, async () => {
  const repository = await freshRepository();
  const [{ getPool }] = await Promise.all([import("../db/pg.js")]);

  // У события 2 уже есть автор, лимит 3 оставляет ровно два свободных места.
  await repository.updateEvent("2", { participantLimit: 3 });
  await getPool().query(
    `INSERT INTO users (id, name, email) VALUES
       ('c1', 'Первый', 'c1@povod.app'), ('c2', 'Второй', 'c2@povod.app'),
       ('c3', 'Третий', 'c3@povod.app'), ('c4', 'Четвёртый', 'c4@povod.app')`,
  );

  // Четверо жмут «Присоединиться» одновременно. Без блокировки строки на запись
  // все четверо прочитали бы «занято 1 из 3» и записались бы все.
  const results = await Promise.all(
    ["c1", "c2", "c3", "c4"].map((userId) => repository.joinEvent("2", userId)),
  );

  assert.equal(results.filter((result) => result.outcome === "joined").length, 2);
  assert.equal(results.filter((result) => result.outcome === "full").length, 2);

  const event = await repository.getEvent("2");
  assert.equal(event?.participants, 3, "лимит не должен быть превышен");
});

test(
  "event rules are stored: ends_at and participant_limit survive a round trip",
  { skip },
  async () => {
    const repository = await freshRepository();

    const updated = await repository.updateEvent("1", {
      endsAt: "2026-06-27T21:00:00.000Z",
      participantLimit: 12,
    });
    assert.equal(updated?.endsAt, "2026-06-27T21:00:00.000Z");
    assert.equal(updated?.participantLimit, 12);

    const reloaded = await repository.getEvent("1");
    assert.equal(reloaded?.endsAt, "2026-06-27T21:00:00.000Z");
    assert.equal(reloaded?.participantLimit, 12);
  },
);

test("the database itself rejects an event that ends before it starts", { skip }, async () => {
  await freshRepository();
  const [{ getPool }] = await Promise.all([import("../db/pg.js")]);

  // Ограничение стоит в схеме, а не только в валидации запроса: в таблицу
  // пишет не один лишь HTTP-слой.
  await assert.rejects(
    () =>
      getPool().query(`UPDATE events SET ends_at = starts_at - interval '1 hour' WHERE id = '1'`),
    /events_ends_after_starts/,
  );
  await assert.rejects(
    () => getPool().query("UPDATE events SET participant_limit = 0 WHERE id = '1'"),
    /events_participant_limit_positive/,
  );
});

test("concurrent updates do not lose each other's fields (BE-004)", { skip }, async () => {
  const repository = await freshRepository();

  // Раньше обновление читало событие вне транзакции, поэтому две параллельные
  // правки разных полей затирали друг друга. Теперь строка блокируется на чтение+запись.
  await Promise.all([
    repository.updateEvent("1", { title: "Новое название" }),
    repository.updateEvent("1", { location: "Новое место" }),
  ]);

  const event = await repository.getEvent("1");
  assert.equal(event?.title, "Новое название");
  assert.equal(event?.location, "Новое место");
});

test("removeFriend reports a missing user instead of silently succeeding", { skip }, async () => {
  const repository = await freshRepository();

  assert.equal(await repository.removeFriend("u1", "does-not-exist"), undefined);
  assert.equal(await repository.requestFriendship("u1", "does-not-exist"), "not-found");
});

test("friendship is symmetric and removed on both sides", { skip }, async () => {
  const repository = await freshRepository();

  // Заявка сама по себе друзьями не делает — нужно согласие (SEC-012).
  assert.equal(await repository.requestFriendship("u2", "u3"), "requested");
  assert.deepEqual(
    (await repository.listFriends("u2"))?.map((u) => u.id),
    ["u1"],
  );
  assert.equal(await repository.acceptFriendRequest("u3", "u2"), true);
  assert.deepEqual((await repository.listFriends("u2"))?.map((u) => u.id).sort(), ["u1", "u3"]);
  assert.deepEqual((await repository.listFriends("u3"))?.map((u) => u.id).sort(), ["u1", "u2"]);

  await repository.removeFriend("u2", "u3");
  assert.deepEqual(
    (await repository.listFriends("u2"))?.map((u) => u.id),
    ["u1"],
  );
  assert.deepEqual(
    (await repository.listFriends("u3"))?.map((u) => u.id),
    ["u1"],
  );
});

test("private events are hidden from outsiders in listings", { skip }, async () => {
  const repository = await freshRepository();

  const created = await repository.createEvent({
    id: "private-1",
    title: "Закрытая встреча",
    description: "",
    startsAt: "2026-09-01T12:00:00.000Z",
    timezone: "Europe/Moscow",
    location: "Секрет",
    category: "Отдых",
    author: "Эльмира Гильманова",
    authorId: "u1",
    participants: 1,
    participantIds: ["u1"],
    format: "private",
    createdAt: new Date().toISOString(),
  });
  assert.equal(created.format, "private");

  const anonymous = await repository.listEvents();
  assert.equal(
    anonymous.some((event) => event.id === "private-1"),
    false,
    "аноним не должен видеть приватное событие",
  );

  const outsider = await repository.listEvents({ viewerId: "u3" });
  assert.equal(
    outsider.some((event) => event.id === "private-1"),
    false,
    "посторонний не должен видеть приватное событие",
  );

  const owner = await repository.listEvents({ viewerId: "u1" });
  assert.equal(
    owner.some((event) => event.id === "private-1"),
    true,
    "автор видит своё приватное событие",
  );
});

test("events can be selected by author and participant", { skip }, async () => {
  const repository = await freshRepository();

  const created = await repository.listEvents({ author: "u1", viewerId: "u1" });
  const attending = await repository.listEvents({ participant: "u1", viewerId: "u1" });

  assert.deepEqual(
    created.map((event) => event.id),
    ["1"],
  );
  assert.deepEqual(attending.map((event) => event.id).sort(), ["1", "3"]);
});

test("event update and delete round-trip through SQL", { skip }, async () => {
  const repository = await freshRepository();

  const updated = await repository.updateEvent("1", { title: "Волейбол на закате" });
  assert.equal(updated?.title, "Волейбол на закате");
  assert.equal((await repository.getEvent("1"))?.title, "Волейбол на закате");

  assert.equal(await repository.deleteEvent("1"), true);
  assert.equal(await repository.getEvent("1"), undefined);
  assert.equal(await repository.deleteEvent("1"), false, "повторное удаление возвращает false");

  // Комментарии удалённого события не должны остаться сиротами.
  assert.deepEqual(await repository.listComments("1"), []);
});

test("comments are created and deleted with author details", { skip }, async () => {
  const repository = await freshRepository();

  const created = await repository.createComment({
    id: "c-new",
    text: "Приду с мячом",
    eventId: "2",
    authorId: "u3",
    createdAt: new Date().toISOString(),
  });
  assert.equal(created.author.id, "u3");
  assert.equal(created.author.name, "Аня Котова");

  assert.equal((await repository.getComment("c-new"))?.text, "Приду с мячом");
  assert.equal(await repository.deleteComment("c-new"), true);
  assert.equal(await repository.getComment("c-new"), undefined);
});

test("sessions: create, resolve, touch, revoke", { skip }, async () => {
  const repository = await freshRepository();

  await repository.createSession({
    id: "s1",
    tokenHash: "a".repeat(64),
    userId: "u1",
    createdAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z",
    lastUsedAt: "2026-07-01T00:00:00.000Z",
  });

  const found = await repository.getSessionByTokenHash("a".repeat(64));
  assert.equal(found?.userId, "u1");
  assert.equal(found?.revokedAt, undefined);

  await repository.touchSession("s1", new Date().toISOString());
  await repository.revokeSession("s1");

  const revoked = await repository.getSessionByTokenHash("a".repeat(64));
  assert.ok(revoked?.revokedAt, "после отзыва должна проставляться отметка");
});

test("deleteExpiredSessions purges expired and revoked rows only (SEC-007)", { skip }, async () => {
  const repository = await freshRepository();

  const base = {
    userId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
  };
  await repository.createSession({
    ...base,
    id: "s-active",
    tokenHash: "b".repeat(64),
    expiresAt: "2999-01-01T00:00:00.000Z",
  });
  await repository.createSession({
    ...base,
    id: "s-expired",
    tokenHash: "c".repeat(64),
    expiresAt: "2020-01-01T00:00:00.000Z",
  });
  await repository.createSession({
    ...base,
    id: "s-revoked",
    tokenHash: "d".repeat(64),
    expiresAt: "2999-01-01T00:00:00.000Z",
  });
  await repository.revokeSession("s-revoked");

  const removed = await repository.deleteExpiredSessions("2026-07-24T00:00:00.000Z");
  assert.equal(removed, 2);

  assert.ok(await repository.getSessionByTokenHash("b".repeat(64)), "активная сессия остаётся");
  assert.equal(await repository.getSessionByTokenHash("c".repeat(64)), undefined);
  assert.equal(await repository.getSessionByTokenHash("d".repeat(64)), undefined);
});

test("password credentials and external identities persist", { skip }, async () => {
  const repository = await freshRepository();

  await repository.setPasswordHash("u1", "scrypt$hash");
  assert.equal(await repository.getPasswordHash("u1"), "scrypt$hash");

  await repository.linkExternalIdentity({
    provider: "vk",
    externalUserId: "12345",
    userId: "u1",
    profile: { name: "Эльмира" },
  });
  const identity = await repository.getExternalIdentity("vk", "12345");
  assert.equal(identity?.userId, "u1");
});

test("deleting a user with owned content returns false, not an error", { skip }, async () => {
  const repository = await freshRepository();

  // u1 — автор события «1» и комментариев: внешние ключи объявлены ON DELETE RESTRICT,
  // поэтому PostgreSQL отклоняет удаление, а не сносит контент каскадом.
  // Расхождение адаптеров: in-memory возвращает false, PostgreSQL бросает 23503.
  // На уровне API оба случая дают 409 (errorHandler маппит код 23503).
  // BE-004: проверка владения и удаление идут одной транзакцией, поэтому адаптер
  // возвращает false так же, как in-memory (раньше PostgreSQL бросал 23503).
  assert.equal(await repository.deleteUser("u1"), false);
  assert.ok(await repository.getUser("u1"), "пользователь остаётся на месте");

  // u2 не создавал событий, но написал комментарий c1 — тоже владелец контента.
  assert.equal(await repository.deleteUser("u2"), false);
  assert.ok(await repository.getUser("u2"));
});

test("a user without content can be deleted", { skip }, async () => {
  const repository = await freshRepository();

  const created = await repository.createPasswordUser(
    {
      id: "u-temp",
      name: "Временный",
      email: "temp@povod.app",
      interests: [],
      friends: [],
      createdAt: new Date().toISOString(),
    },
    "scrypt$hash",
  );
  assert.equal(created.id, "u-temp");

  assert.equal(await repository.deleteUser("u-temp"), true);
  assert.equal(await repository.getUser("u-temp"), undefined);
});

test("profile fields round-trip through SQL, including city (BE-010)", { skip }, async () => {
  const repository = await freshRepository();

  const before = await repository.getUser("u1");
  assert.ok(before);
  assert.equal(before.city, undefined, "у сид-пользователя города нет");

  await repository.upsertUser({ ...before, name: "Эльмира Г.", city: "Казань", interests: ["IT"] });

  const after = await repository.getUser("u1");
  assert.equal(after?.name, "Эльмира Г.");
  assert.equal(after?.city, "Казань");
  assert.deepEqual(after?.interests, ["IT"]);
});

runDirectMessageConformance("postgres", freshRepository, { skip });
