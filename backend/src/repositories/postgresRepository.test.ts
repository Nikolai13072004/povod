import assert from "node:assert/strict";
import test from "node:test";

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
  "auth_sessions",
  "password_credentials",
  "external_identities",
  "comments",
  "event_participants",
  "friendships",
  "events",
  "users",
];

type Repo = import("./repository").PovodRepository;

/**
 * Возвращает репозиторий с чистой, заново засеянной базой: чистим таблицы
 * (включая маркер bootstrap в `app_metadata`) и заново прогоняем `init()`.
 */
async function freshRepository(): Promise<Repo> {
  const [{ getPool }, { PostgresRepository }] = await Promise.all([
    import("../db/pg"),
    import("./postgresRepository"),
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
  const [{ getPool }] = await Promise.all([import("../db/pg")]);
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
  assert.ok(applied.rows.length >= 4, "должны быть применены все нумерованные миграции");
  assert.ok(
    applied.rows.some((row) => row.version.startsWith("004")),
    "миграция 004 (индекс очистки сессий) должна быть применена",
  );
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

  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(second.participantIds.sort(), ["u1", "u2"]);
  assert.equal(second.participants, 2, "счётчик выводится из связей участия");

  const afterLeave = await repository.leaveEvent("2", "u1");
  assert.deepEqual(afterLeave?.participantIds, ["u2"]);
  assert.equal(afterLeave?.participants, 1);
});

test("joining a missing event returns undefined and inserts nothing", { skip }, async () => {
  const repository = await freshRepository();
  const [{ getPool }] = await Promise.all([import("../db/pg")]);

  assert.equal(await repository.joinEvent("does-not-exist", "u1"), undefined);

  const rows = await getPool().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM event_participants WHERE event_id = $1",
    ["does-not-exist"],
  );
  assert.equal(rows.rows[0]?.count, "0");
});

test("friendship is symmetric and removed on both sides", { skip }, async () => {
  const repository = await freshRepository();

  await repository.addFriend("u2", "u3");
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

test("deleting a user with owned content is refused by the database", { skip }, async () => {
  const repository = await freshRepository();

  // u1 — автор события «1» и комментариев: внешние ключи объявлены ON DELETE RESTRICT,
  // поэтому PostgreSQL отклоняет удаление, а не сносит контент каскадом.
  // Расхождение адаптеров: in-memory возвращает false, PostgreSQL бросает 23503.
  // На уровне API оба случая дают 409 (errorHandler маппит код 23503).
  await assert.rejects(
    () => repository.deleteUser("u1"),
    (error: { code?: string }) => error.code === "23503",
    "удаление автора контента должно отклоняться внешним ключом",
  );
  assert.ok(await repository.getUser("u1"), "пользователь остаётся на месте");
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
