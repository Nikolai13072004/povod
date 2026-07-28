import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
  compareFeed,
  cursorOf,
  decodeCursor,
  encodeCursor,
  isAfterCursor,
  matchesInterests,
  normalizeFeedLimit,
} from "./feed.js";
import type { Event } from "./types.js";

const event = (overrides: Partial<Event> = {}): Event => ({
  id: "1",
  title: "Событие",
  description: "",
  startsAt: "2026-07-01T12:00:00.000Z",
  timezone: "Europe/Moscow",
  location: "",
  author: "Автор",
  authorId: "u1",
  participants: 1,
  participantIds: ["u1"],
  createdAt: "2026-06-01T10:00:00.000Z",
  ...overrides,
});

test("feed limit stays within bounds whatever the query says", () => {
  assert.equal(normalizeFeedLimit(undefined), DEFAULT_FEED_LIMIT);
  assert.equal(normalizeFeedLimit("не число"), DEFAULT_FEED_LIMIT);
  assert.equal(normalizeFeedLimit("0"), DEFAULT_FEED_LIMIT);
  assert.equal(normalizeFeedLimit("-5"), DEFAULT_FEED_LIMIT);
  assert.equal(normalizeFeedLimit("7"), 7);
  // Иначе один запрос мог бы вытащить всю таблицу.
  assert.equal(normalizeFeedLimit("100000"), MAX_FEED_LIMIT);
});

test("a broken cursor shows the first page instead of an error", () => {
  const cursor = { matchesInterests: true, createdAt: "2026-06-01T10:00:00.000Z", id: "7" };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);

  // Курсор приезжает из адресной строки: испортить его может кто угодно, и
  // ронять из-за этого ленту нельзя.
  assert.equal(decodeCursor(undefined), undefined);
  assert.equal(decodeCursor("не base64"), undefined);
  assert.equal(decodeCursor(Buffer.from('{"id":42}').toString("base64url")), undefined);
});

test("interest matching ignores case and the е/ё difference", () => {
  assert.equal(matchesInterests(event({ category: "Музыка" }), ["музыка"]), true);
  assert.equal(matchesInterests(event({ category: "Ёлки" }), ["Елки"]), true);
  assert.equal(matchesInterests(event({ tags: ["Спорт"] }), ["спорт"]), true);
  assert.equal(matchesInterests(event({ category: "Музыка" }), ["Спорт"]), false);
  assert.equal(matchesInterests(event({ category: "Музыка" }), []), false);
  assert.equal(matchesInterests(event({ category: "Музыка" }), undefined), false);
});

test("feed order puts matching events first, then the freshest", () => {
  const interests = ["Музыка"];
  const matching = cursorOf(event({ id: "a", category: "Музыка" }), interests);
  const fresherButOffTopic = cursorOf(
    event({ id: "b", createdAt: "2026-06-02T10:00:00.000Z" }),
    interests,
  );
  assert.ok(compareFeed(matching, fresherButOffTopic) < 0, "интересное идёт раньше свежего");

  const older = cursorOf(event({ id: "c", createdAt: "2026-05-01T10:00:00.000Z" }), interests);
  assert.ok(compareFeed(fresherButOffTopic, older) < 0);

  // Одинаковая дата с точностью до микросекунды — обычное дело при импорте;
  // без сравнения по id порядок был бы неопределённым, а страницы — рваными.
  const sameTimeA = cursorOf(event({ id: "z" }), interests);
  const sameTimeB = cursorOf(event({ id: "y" }), interests);
  assert.ok(compareFeed(sameTimeA, sameTimeB) < 0);
  assert.ok(compareFeed(sameTimeB, sameTimeA) > 0);
});

test("the cursor boundary neither skips nor repeats an event", () => {
  const interests = ["Музыка"];
  const previous = cursorOf(event({ id: "b", createdAt: "2026-06-02T10:00:00.000Z" }), interests);

  assert.equal(isAfterCursor(previous, previous), false, "сам себя не повторяет");
  assert.equal(
    isAfterCursor(
      cursorOf(event({ id: "c", createdAt: "2026-05-01T10:00:00.000Z" }), interests),
      previous,
    ),
    true,
  );
  assert.equal(
    isAfterCursor(
      cursorOf(event({ id: "d", createdAt: "2026-06-03T10:00:00.000Z" }), interests),
      previous,
    ),
    false,
  );
  // Событие с той же датой, но меньшим id идёт следом — а не теряется.
  assert.equal(
    isAfterCursor(
      cursorOf(event({ id: "a", createdAt: "2026-06-02T10:00:00.000Z" }), interests),
      previous,
    ),
    true,
  );
});
