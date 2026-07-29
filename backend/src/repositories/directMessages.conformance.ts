import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_THREAD_LIMIT, MAX_DIALOGS } from "../directMessages.js";
import type { PovodRepository } from "./repository.js";

/**
 * Один набор проверок для обоих адаптеров хранилища (PROD-011).
 *
 * Адаптеры уже расходились молча: `deleteUser` вёл себя по-разному (BE-004), а
 * список друзей в PostgreSQL включал неподтверждённые заявки, тогда как в
 * памяти — нет. Оба раза расхождение находилось не тестом, а в бою, потому что
 * каждый адаптер проверялся своим набором.
 *
 * Здесь проверки написаны один раз и запускаются дважды. Всё, что зависит от
 * конкретного хранилища (SQL, транзакции, миграции), проверяется отдельно.
 *
 * Опорные данные — seed: u1 дружит с u2 и u3, а u2 и u3 друг с другом нет.
 */

interface Options {
  /** Пропуск с объяснением — у PostgreSQL-набора без базы. */
  skip?: string | false;
}

export function runDirectMessageConformance(
  label: string,
  freshRepository: () => Promise<PovodRepository>,
  { skip = false }: Options = {},
): void {
  const named = (name: string) => `[${label}] ${name}`;
  let counter = 0;
  const nextId = () => `dm-test-${(counter += 1)}`;

  const send = (repository: PovodRepository, senderId: string, recipientId: string, text: string) =>
    repository.sendDirectMessage({
      id: nextId(),
      text,
      senderId,
      recipientId,
      createdAt: new Date().toISOString(),
    });

  test(named("друзья переписываются, посторонние — нет"), { skip }, async () => {
    const repository = await freshRepository();

    const allowed = await send(repository, "u1", "u2", "привет");
    assert.equal(allowed.outcome, "sent");

    // u2 и u3 не друзья: отказ, а не 500 и не тихая запись.
    const denied = await send(repository, "u2", "u3", "привет");
    assert.equal(denied.outcome, "not-allowed");
  });

  test(named("написать самому себе нельзя"), { skip }, async () => {
    const repository = await freshRepository();
    assert.equal((await send(repository, "u1", "u1", "заметка")).outcome, "not-allowed");
  });

  test(named("несуществующий собеседник неотличим от недруга"), { skip }, async () => {
    // Различив эти случаи, мы дали бы способ перебором выяснять, есть ли аккаунт.
    const repository = await freshRepository();
    const missing = await send(repository, "u1", "нет-такого", "привет");
    assert.equal(missing.outcome, "not-allowed");
  });

  test(named("переписка видна обоим и в одном порядке"), { skip }, async () => {
    const repository = await freshRepository();
    await send(repository, "u1", "u2", "первое");
    await send(repository, "u2", "u1", "второе");

    const mine = await repository.listDirectMessages("u1", "u2", { limit: DEFAULT_THREAD_LIMIT });
    const theirs = await repository.listDirectMessages("u2", "u1", { limit: DEFAULT_THREAD_LIMIT });

    assert.deepEqual(
      mine.map((item) => item.text),
      ["второе", "первое"],
      "свежие сообщения идут первыми",
    );
    assert.deepEqual(
      theirs.map((item) => item.id),
      mine.map((item) => item.id),
      "диалог — производная от пары, а не от того, кто спрашивает",
    );
  });

  test(named("посторонний не читает чужую переписку"), { skip }, async () => {
    const repository = await freshRepository();
    await send(repository, "u1", "u2", "секрет");

    // Пара считается из идентификатора спрашивающего: третьего участника у
    // диалога не бывает, поэтому чужая переписка не выражается запросом.
    const outsider = await repository.listDirectMessages("u3", "u2", {
      limit: DEFAULT_THREAD_LIMIT,
    });
    assert.deepEqual(outsider, []);
  });

  test(named("курсор листает историю без потерь и повторов"), { skip }, async () => {
    const repository = await freshRepository();
    const sent: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const result = await send(repository, "u1", "u2", `сообщение ${index}`);
      assert.equal(result.outcome, "sent");
      if (result.outcome === "sent") sent.push(result.message.id);
    }

    const seen: string[] = [];
    let cursor: { createdAt: string; id: string } | undefined;
    for (let page = 0; page < 5; page += 1) {
      const items = await repository.listDirectMessages("u1", "u2", { limit: 2, cursor });
      if (items.length === 0) break;
      seen.push(...items.map((item) => item.id));
      const last = items[items.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
    }

    assert.equal(new Set(seen).size, seen.length, "страницы не повторяют сообщения");
    assert.deepEqual([...seen].sort(), [...sent].sort(), "ни одно сообщение не потеряно");
  });

  test(named("непрочитанные считаются только у получателя"), { skip }, async () => {
    const repository = await freshRepository();
    await send(repository, "u1", "u2", "раз");
    await send(repository, "u1", "u2", "два");

    assert.equal(await repository.countUnreadDirectMessages("u2"), 2);
    assert.equal(
      await repository.countUnreadDirectMessages("u1"),
      0,
      "своё не бывает непрочитанным",
    );
  });

  test(named("отметка о прочтении идемпотентна"), { skip }, async () => {
    const repository = await freshRepository();
    await send(repository, "u1", "u2", "привет");
    const readAt = new Date().toISOString();

    assert.equal(await repository.markDirectMessagesRead("u2", "u1", readAt), 1);
    assert.equal(
      await repository.markDirectMessagesRead("u2", "u1", readAt),
      0,
      "повтор ничего не меняет",
    );
    assert.equal(await repository.countUnreadDirectMessages("u2"), 0);
  });

  test(named("чужие сообщения прочитанными не пометить"), { skip }, async () => {
    const repository = await freshRepository();
    await send(repository, "u1", "u2", "привет");

    // Подстановка чужого идентификатора не помогает: условие зашито в запрос.
    assert.equal(await repository.markDirectMessagesRead("u3", "u1", new Date().toISOString()), 0);
    assert.equal(await repository.countUnreadDirectMessages("u2"), 1);
  });

  test(named("уведомление шлётся только о первом непрочитанном"), { skip }, async () => {
    const repository = await freshRepository();

    const first = await send(repository, "u1", "u2", "раз");
    assert.equal(first.outcome === "sent" && first.firstUnread, true);

    const second = await send(repository, "u1", "u2", "два");
    assert.equal(
      second.outcome === "sent" && second.firstUnread,
      false,
      "серия сообщений не должна забивать колокольчик",
    );

    // После прочтения счёт начинается заново.
    await repository.markDirectMessagesRead("u2", "u1", new Date().toISOString());
    const third = await send(repository, "u1", "u2", "три");
    assert.equal(third.outcome === "sent" && third.firstUnread, true);
  });

  test(
    named("список диалогов показывает последнюю реплику и непрочитанные"),
    { skip },
    async () => {
      const repository = await freshRepository();
      await send(repository, "u1", "u2", "старое");
      await send(repository, "u2", "u1", "новое");
      await send(repository, "u3", "u1", "от третьего");

      const dialogs = await repository.listDialogs("u1", MAX_DIALOGS);
      assert.equal(dialogs.length, 2, "по одному диалогу на собеседника");

      const withU2 = dialogs.find((item) => item.peer.id === "u2");
      assert.equal(withU2?.lastMessage.text, "новое");
      assert.equal(withU2?.unread, 1, "считаются только входящие");

      // Свежий диалог сверху.
      assert.equal(dialogs[0]?.peer.id, "u3");
    },
  );

  test(named("свои сообщения не попадают в непрочитанные диалога"), { skip }, async () => {
    const repository = await freshRepository();
    await send(repository, "u1", "u2", "моё");

    const dialogs = await repository.listDialogs("u1", MAX_DIALOGS);
    assert.equal(dialogs[0]?.unread, 0);
  });

  test(named("правка оставляет отметку, а не подменяет текст молча"), { skip }, async () => {
    const repository = await freshRepository();
    const sentResult = await send(repository, "u1", "u2", "опечятка");
    assert.equal(sentResult.outcome, "sent");
    if (sentResult.outcome !== "sent") return;

    const editedAt = new Date().toISOString();
    const updated = await repository.updateDirectMessage(
      sentResult.message.id,
      "опечатка",
      editedAt,
    );

    assert.equal(updated?.text, "опечатка");
    assert.equal(updated?.editedAt, editedAt, "собеседник обязан видеть, что реплику меняли");
  });

  test(named("удаление убирает сообщение из переписки"), { skip }, async () => {
    const repository = await freshRepository();
    const sentResult = await send(repository, "u1", "u2", "лишнее");
    assert.equal(sentResult.outcome, "sent");
    if (sentResult.outcome !== "sent") return;

    assert.equal(await repository.deleteDirectMessage(sentResult.message.id), true);
    assert.equal(
      await repository.deleteDirectMessage(sentResult.message.id),
      false,
      "повтор — ложь",
    );
    assert.deepEqual(
      await repository.listDirectMessages("u1", "u2", { limit: DEFAULT_THREAD_LIMIT }),
      [],
    );
  });

  test(named("удалённое непрочитанное перестаёт считаться"), { skip }, async () => {
    const repository = await freshRepository();
    const sentResult = await send(repository, "u1", "u2", "лишнее");
    if (sentResult.outcome !== "sent") return;

    await repository.deleteDirectMessage(sentResult.message.id);
    assert.equal(await repository.countUnreadDirectMessages("u2"), 0);
  });

  test(named("подтверждённая дружба отличается от заявки"), { skip }, async () => {
    const repository = await freshRepository();

    assert.equal(await repository.areFriends("u1", "u2"), true);
    assert.equal(await repository.areFriends("u2", "u3"), false);
    assert.equal(await repository.areFriends("u1", "u1"), false, "сам себе не друг");

    // Отправленная, но не принятая заявка друзьями не делает — именно на этом
    // расходились адаптеры (SEC-012).
    assert.equal(await repository.requestFriendship("u2", "u3"), "requested");
    assert.equal(await repository.areFriends("u2", "u3"), false);
    assert.equal((await send(repository, "u2", "u3", "привет")).outcome, "not-allowed");

    await repository.acceptFriendRequest("u3", "u2");
    assert.equal(await repository.areFriends("u2", "u3"), true);
    assert.equal((await send(repository, "u2", "u3", "привет")).outcome, "sent");
  });

  test(named("расторжение дружбы закрывает отправку, но не историю"), { skip }, async () => {
    const repository = await freshRepository();
    await send(repository, "u1", "u2", "пока дружили");

    await repository.removeFriend("u1", "u2");

    assert.equal((await send(repository, "u1", "u2", "уже нет")).outcome, "not-allowed");
    const history = await repository.listDirectMessages("u1", "u2", {
      limit: DEFAULT_THREAD_LIMIT,
    });
    assert.deepEqual(
      history.map((item) => item.text),
      ["пока дружили"],
      "написанное не исчезает от того, что дружба кончилась",
    );
  });
}
