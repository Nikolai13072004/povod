import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRepository } from "./memoryRepository";

test("joining an event is idempotent and participant count is derived", async () => {
  const repository = new MemoryRepository();
  await repository.init();

  const first = await repository.joinEvent("2", "u1");
  const second = await repository.joinEvent("2", "u1");

  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(second.participantIds.sort(), ["u1", "u2"]);
  assert.equal(second.participants, 2);
});

test("friendship is visible to both users and removed symmetrically", async () => {
  const repository = new MemoryRepository();
  await repository.init();

  await repository.addFriend("u2", "u3");
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

  assert.deepEqual(
    created.map((event) => event.id),
    ["1"],
  );
  assert.deepEqual(accepted.map((event) => event.id).sort(), ["1", "3"]);
});
