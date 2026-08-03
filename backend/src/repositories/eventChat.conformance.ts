import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EVENT_CHAT_LIMIT } from "../eventChat.js";
import type { PovodRepository } from "./repository.js";
import type { Event } from "../types.js";

/**
 * Один набор проверок чата события для обоих адаптеров (PROD-013).
 *
 * Та же защита от молчаливого расхождения, что и у личных сообщений
 * (directMessages.conformance): право писать в комнату выводится из участия, и
 * одинаково ли оно считается в SQL и в памяти — проверяется здесь, один раз.
 *
 * Опорные пользователи — seed: u1, u2, u3. Событие с чатом набор создаёт сам:
 * сид-события чат не включают.
 */

interface Options {
  skip?: string | false;
}

export function runEventChatConformance(
  label: string,
  freshRepository: () => Promise<PovodRepository>,
  { skip = false }: Options = {},
): void {
  const named = (name: string) => `[${label}] чат события: ${name}`;
  let counter = 0;
  const nextId = () => `ec-test-${(counter += 1)}`;

  /** Событие u1 с участником u2. u3 — посторонний. Чат по флагу. */
  async function makeEvent(repository: PovodRepository, chatEnabled: boolean): Promise<Event> {
    const id = nextId();
    return repository.createEvent({
      id,
      title: `Событие ${id}`,
      description: "для проверки чата",
      startsAt: "2027-01-01T12:00:00.000Z",
      timezone: "Europe/Moscow",
      location: "Кафе",
      author: "u1",
      authorId: "u1",
      participants: 2,
      participantIds: ["u1", "u2"],
      chatEnabled,
      createdAt: new Date().toISOString(),
    });
  }

  const send = (repository: PovodRepository, eventId: string, senderId: string, text: string) =>
    repository.sendEventMessage({
      id: nextId(),
      eventId,
      senderId,
      text,
      createdAt: new Date().toISOString(),
    });

  test(named("автор и участник видят комнату, посторонний — нет"), { skip }, async () => {
    const repository = await freshRepository();
    const event = await makeEvent(repository, true);
    const limit = DEFAULT_EVENT_CHAT_LIMIT;

    assert.deepEqual(await repository.listEventMessages(event.id, "u1", { limit }), []);
    assert.deepEqual(await repository.listEventMessages(event.id, "u2", { limit }), []);
    // u3 не участник: комнаты для него не существует, отличить её от пустой нельзя.
    assert.equal(await repository.listEventMessages(event.id, "u3", { limit }), undefined);
  });

  test(named("выключенный чат закрыт даже для автора"), { skip }, async () => {
    const repository = await freshRepository();
    const event = await makeEvent(repository, false);
    assert.equal(
      await repository.listEventMessages(event.id, "u1", { limit: DEFAULT_EVENT_CHAT_LIMIT }),
      undefined,
    );
    assert.equal((await send(repository, event.id, "u1", "эй")).outcome, "not-allowed");
  });

  test(named("несуществующее событие неотличимо от закрытой комнаты"), { skip }, async () => {
    const repository = await freshRepository();
    assert.equal(
      await repository.listEventMessages("нет-такого", "u1", { limit: DEFAULT_EVENT_CHAT_LIMIT }),
      undefined,
    );
    assert.equal((await send(repository, "нет-такого", "u1", "эй")).outcome, "not-allowed");
  });

  test(named("участники пишут, посторонний — нет; имя подписывается"), { skip }, async () => {
    const repository = await freshRepository();
    const event = await makeEvent(repository, true);

    const byAuthor = await send(repository, event.id, "u1", "привет всем");
    assert.equal(byAuthor.outcome, "sent");
    if (byAuthor.outcome === "sent") {
      assert.equal(byAuthor.message.senderId, "u1");
      // Имя копируется в реплику, а не собирается JOIN'ом при чтении.
      assert.equal(typeof byAuthor.message.senderName, "string");
      assert.ok(byAuthor.message.senderName.length > 0);
    }

    assert.equal((await send(repository, event.id, "u2", "и я тут")).outcome, "sent");
    // u3 не участник — писать нельзя, и это тот же отказ, что «события нет».
    assert.equal((await send(repository, event.id, "u3", "впустите")).outcome, "not-allowed");
  });

  test(named("лента общая: одинакова у автора и участника, свежие первыми"), { skip }, async () => {
    const repository = await freshRepository();
    const event = await makeEvent(repository, true);
    await send(repository, event.id, "u1", "первое");
    await send(repository, event.id, "u2", "второе");

    const asAuthor = await repository.listEventMessages(event.id, "u1", {
      limit: DEFAULT_EVENT_CHAT_LIMIT,
    });
    const asMember = await repository.listEventMessages(event.id, "u2", {
      limit: DEFAULT_EVENT_CHAT_LIMIT,
    });

    assert.deepEqual(
      asAuthor?.map((item) => item.text),
      ["второе", "первое"],
      "свежие сообщения идут первыми",
    );
    assert.deepEqual(
      asMember?.map((item) => item.id),
      asAuthor?.map((item) => item.id),
      "комната одна на событие, а не на спрашивающего",
    );
  });

  test(named("курсор листает без потерь и повторов"), { skip }, async () => {
    const repository = await freshRepository();
    const event = await makeEvent(repository, true);
    const sent: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const result = await send(repository, event.id, "u1", `сообщение ${index}`);
      if (result.outcome === "sent") sent.push(result.message.id);
    }

    const seen: string[] = [];
    let cursor: { createdAt: string; id: string } | undefined;
    for (let page = 0; page < 5; page += 1) {
      const items = await repository.listEventMessages(event.id, "u1", { limit: 2, cursor });
      if (!items || items.length === 0) break;
      seen.push(...items.map((item) => item.id));
      const last = items[items.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
    }

    assert.equal(new Set(seen).size, seen.length, "страницы не повторяют сообщения");
    assert.deepEqual([...seen].sort(), [...sent].sort(), "ни одно сообщение не потеряно");
  });

  test(named("удаляет свою реплику её автор; автор события — любую"), { skip }, async () => {
    const repository = await freshRepository();
    const event = await makeEvent(repository, true);
    const mine = await send(repository, event.id, "u2", "моё");
    const other = await send(repository, event.id, "u2", "тоже моё");
    assert.equal(mine.outcome, "sent");
    assert.equal(other.outcome, "sent");
    const mineId = mine.outcome === "sent" ? mine.message.id : "";
    const otherId = other.outcome === "sent" ? other.message.id : "";

    // u1 (не автор реплики, но автор события) чужую реплику удалить не может? —
    // может, это модерация своей комнаты.
    assert.equal(await repository.deleteEventMessage(event.id, mineId, "u1"), true);
    // u2 удаляет собственную.
    assert.equal(await repository.deleteEventMessage(event.id, otherId, "u2"), true);

    const left = await repository.listEventMessages(event.id, "u1", {
      limit: DEFAULT_EVENT_CHAT_LIMIT,
    });
    assert.deepEqual(left, [], "обе реплики убраны");
  });

  test(named("чужую реплику посторонний не удаляет"), { skip }, async () => {
    const repository = await freshRepository();
    const event = await makeEvent(repository, true);
    const message = await send(repository, event.id, "u1", "автора события");
    const messageId = message.outcome === "sent" ? message.message.id : "";

    // u2 — участник, но не автор события и не автор реплики: удалить не может.
    assert.equal(await repository.deleteEventMessage(event.id, messageId, "u2"), false);
    // u3 — вообще посторонний.
    assert.equal(await repository.deleteEventMessage(event.id, messageId, "u3"), false);

    const still = await repository.listEventMessages(event.id, "u1", {
      limit: DEFAULT_EVENT_CHAT_LIMIT,
    });
    assert.equal(still?.length, 1, "чужая реплика на месте");
  });
}
