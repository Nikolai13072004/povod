import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_THREAD_LIMIT,
  MAX_THREAD_LIMIT,
  compareMessages,
  cursorOfMessage,
  decodeMessageCursor,
  encodeMessageCursor,
  isAfterMessageCursor,
  normalizeThreadLimit,
  threadKey,
} from "./directMessages.js";
import type { DirectMessage } from "./types.js";

const message = (overrides: Partial<DirectMessage> = {}): DirectMessage => ({
  id: "m1",
  senderId: "u1",
  recipientId: "u2",
  text: "привет",
  createdAt: "2026-07-01T12:00:00.000Z",
  ...overrides,
});

test("ключ пары не зависит от того, кто отправитель", () => {
  assert.equal(threadKey("u1", "u2"), threadKey("u2", "u1"));
});

test("ключ пары собран как least:greatest — так же, как CHECK в миграции", () => {
  // Разойдётся с SQL — вставка начнёт падать на ограничении, причём только в
  // PostgreSQL и только в бою.
  assert.equal(threadKey("b", "a"), "a:b");
  assert.equal(threadKey("u10", "u9"), "u10:u9");
});

test("предел страницы не даёт запросить всю историю разом", () => {
  assert.equal(normalizeThreadLimit(String(MAX_THREAD_LIMIT + 1000)), MAX_THREAD_LIMIT);
});

test("невнятный limit не ошибка: берётся значение по умолчанию", () => {
  for (const value of [undefined, "", "много", "0", "-5", "2.5"]) {
    assert.equal(normalizeThreadLimit(value), DEFAULT_THREAD_LIMIT, `limit=${String(value)}`);
  }
});

test("курсор переживает кодирование", () => {
  const cursor = cursorOfMessage(message({ id: "m7", createdAt: "2026-07-02T08:30:00.000Z" }));
  assert.deepEqual(decodeMessageCursor(encodeMessageCursor(cursor)), cursor);
});

test("битый курсор — не ошибка, а первая страница", () => {
  for (const value of ["не base64", "", Buffer.from("{}", "utf8").toString("base64url")]) {
    assert.equal(decodeMessageCursor(value), undefined, `курсор=${value}`);
  }
});

test("свежие сообщения идут первыми", () => {
  const older = cursorOfMessage(message({ id: "a", createdAt: "2026-07-01T12:00:00.000Z" }));
  const newer = cursorOfMessage(message({ id: "b", createdAt: "2026-07-01T12:00:01.000Z" }));
  assert.ok(compareMessages(newer, older) < 0);
});

test("при равной метке порядок решает id — иначе он не строгий", () => {
  const left = cursorOfMessage(message({ id: "a" }));
  const right = cursorOfMessage(message({ id: "b" }));
  assert.ok(compareMessages(right, left) < 0);
  assert.ok(compareMessages(left, right) > 0);
});

test("сообщение не идёт после самого себя", () => {
  // Иначе последнее сообщение страницы повторяется первым на следующей.
  const cursor = cursorOfMessage(message());
  assert.equal(compareMessages(cursor, cursor), 0);
  assert.equal(isAfterMessageCursor(cursor, cursor), false);
});

test("глубже в историю — значит после курсора", () => {
  const cursor = cursorOfMessage(message({ id: "b", createdAt: "2026-07-01T12:00:01.000Z" }));
  const older = cursorOfMessage(message({ id: "a", createdAt: "2026-07-01T12:00:00.000Z" }));
  const newer = cursorOfMessage(message({ id: "c", createdAt: "2026-07-01T12:00:02.000Z" }));

  assert.equal(isAfterMessageCursor(older, cursor), true);
  assert.equal(isAfterMessageCursor(newer, cursor), false);
});

test("сообщения одной миллисекунды не проваливаются между страницами", () => {
  // Метку пишет приложение с точностью до миллисекунды, поэтому у быстрой
  // переписки она совпадает. Разбирать такие пары обязан id — иначе часть
  // сообщений не попадёт ни на одну страницу.
  const sameMoment = "2026-07-01T12:00:00.000Z";
  const page = [
    cursorOfMessage(message({ id: "m3", createdAt: sameMoment })),
    cursorOfMessage(message({ id: "m2", createdAt: sameMoment })),
    cursorOfMessage(message({ id: "m1", createdAt: sameMoment })),
  ];

  const cursor = page[1]!;
  const rest = page.filter((candidate) => isAfterMessageCursor(candidate, cursor));
  assert.deepEqual(
    rest.map((item) => item.id),
    ["m1"],
  );
});
