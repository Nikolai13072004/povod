import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRepository } from "./memoryRepository.js";
import { runDirectMessageConformance } from "./directMessages.conformance.js";

test("joining an event is idempotent and participant count is derived", async () => {
  const repository = new MemoryRepository();
  await repository.init();

  const first = await repository.joinEvent("2", "u1");
  const second = await repository.joinEvent("2", "u1");

  assert.equal(first.outcome, "joined");
  // Повтор отличается от первой записи по исходу, но не по результату.
  assert.equal(second.outcome, "already-joined");
  assert.deepEqual(second.event.participantIds.sort(), ["u1", "u2"]);
  assert.equal(second.event.participants, 2);
});

test("joining respects the participant limit (BE-007)", async () => {
  const repository = new MemoryRepository();
  await repository.init();

  // У события 2 уже есть один участник — автор.
  await repository.updateEvent("2", { participantLimit: 2 });

  assert.equal((await repository.joinEvent("2", "u1")).outcome, "joined");
  const overflow = await repository.joinEvent("2", "u3");
  assert.equal(overflow.outcome, "full");

  // Отказ не меняет состав: третий не записан.
  const event = await repository.getEvent("2");
  assert.deepEqual(event?.participantIds.sort(), ["u1", "u2"]);

  // Место освободилось — запись снова возможна.
  await repository.leaveEvent("2", "u1");
  assert.equal((await repository.joinEvent("2", "u3")).outcome, "joined");
});

test("without a limit joining is unbounded, and a missing event is reported as such", async () => {
  const repository = new MemoryRepository();
  await repository.init();

  for (const userId of ["u1", "u3"]) {
    assert.equal((await repository.joinEvent("2", userId)).outcome, "joined");
  }
  assert.equal((await repository.joinEvent("does-not-exist", "u1")).outcome, "not-found");
});

test("a user cannot befriend themselves", async () => {
  // В PostgreSQL это отсекают ранний возврат и CHECK (user_id < friend_id);
  // здесь защиты не было, и собственный идентификатор попадал в собственный
  // список друзей — причём снимок на диск это переживал.
  const repository = new MemoryRepository();
  await repository.init();

  const before = (await repository.listFriends("u1"))?.map((user) => user.id) ?? [];
  assert.equal(await repository.requestFriendship("u1", "u1"), "self");
  const after = (await repository.listFriends("u1"))?.map((user) => user.id) ?? [];

  assert.deepEqual(after, before);
  assert.ok(!after.includes("u1"), "пользователь не должен быть сам себе другом");
});

test("friendship is visible to both users and removed symmetrically", async () => {
  const repository = new MemoryRepository();
  await repository.init();

  // Дружба возникает только после согласия второй стороны (SEC-012).
  assert.equal(await repository.requestFriendship("u2", "u3"), "requested");
  assert.deepEqual(
    (await repository.listFriends("u2"))?.map((user) => user.id),
    ["u1"],
  );
  assert.equal(await repository.acceptFriendRequest("u3", "u2"), true);
  assert.deepEqual((await repository.listFriends("u2"))?.map((user) => user.id).sort(), [
    "u1",
    "u3",
  ]);
  assert.deepEqual((await repository.listFriends("u3"))?.map((user) => user.id).sort(), [
    "u1",
    "u2",
  ]);

  await repository.removeFriend("u2", "u3");
  assert.deepEqual(
    (await repository.listFriends("u2"))?.map((user) => user.id),
    ["u1"],
  );
  assert.deepEqual(
    (await repository.listFriends("u3"))?.map((user) => user.id),
    ["u1"],
  );
});

test("events can be selected by author and participant", async () => {
  const repository = new MemoryRepository();
  await repository.init();

  const created = await repository.listEvents({ author: "u1" });
  const accepted = await repository.listEvents({ participant: "u1" });

  // Проверяем свойство фильтра, а не точный набор id: сид-события меняются
  // (их число и авторов правят под демо), и жёсткий список ломался бы на каждой
  // такой правке, ничего при этом не проверяя по существу.
  assert.ok(created.length > 0, "у u1 есть созданные события");
  assert.ok(
    created.every((event) => event.authorId === "u1"),
    "фильтр по автору вернул только события u1",
  );
  assert.ok(accepted.length > 0, "u1 где-то участвует");
  assert.ok(
    accepted.every((event) => event.participantIds.includes("u1")),
    "фильтр по участнику вернул только события с u1",
  );
});

test("deleteExpiredSessions removes expired and revoked sessions, keeps active (SEC-007)", async () => {
  const repository = new MemoryRepository();
  await repository.init();

  const base = {
    userId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
  };
  await repository.createSession({
    ...base,
    id: "s-active",
    tokenHash: "hash-active",
    expiresAt: "2999-01-01T00:00:00.000Z",
  });
  await repository.createSession({
    ...base,
    id: "s-expired",
    tokenHash: "hash-expired",
    expiresAt: "2020-01-01T00:00:00.000Z",
  });
  await repository.createSession({
    ...base,
    id: "s-revoked",
    tokenHash: "hash-revoked",
    expiresAt: "2999-01-01T00:00:00.000Z",
    revokedAt: "2026-02-01T00:00:00.000Z",
  });

  const removed = await repository.deleteExpiredSessions("2026-07-24T00:00:00.000Z");
  assert.equal(removed, 2);

  assert.ok(await repository.getSessionByTokenHash("hash-active"));
  assert.equal(await repository.getSessionByTokenHash("hash-expired"), undefined);
  assert.equal(await repository.getSessionByTokenHash("hash-revoked"), undefined);
});

runDirectMessageConformance("память", async () => {
  const repository = new MemoryRepository();
  await repository.init();
  return repository;
});
