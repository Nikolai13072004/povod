import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";

/**
 * Личные сообщения через HTTP (PROD-011).
 *
 * Проверяется в первую очередь то, чего не видно на уровне хранилища: что все
 * отказы отвечают ОДИНАКОВО. Разные коды на «нет такого пользователя» и «вы не
 * друзья» превратили бы маршрут в способ перебором выяснять, кто
 * зарегистрирован.
 *
 * Отдельно — путь «как из браузера», с куками и CSRF. Тесты на Bearer-токене
 * проверку double submit не проходят вовсе: она включается только при наличии
 * куки сессии. Маршрут, покрытый лишь Bearer-тестом, отвечает в браузере 403.
 */

interface TestApp {
  baseUrl: string;
  server: Server;
}

async function startTestApp(context: TestContext): Promise<TestApp> {
  process.env.PERSIST = "false";
  process.env.NODE_ENV = "test";
  process.env.ENABLE_EXTERNAL_EVENTS = "false";
  process.env.DEMO_AUTH_ENABLED = "true";
  process.env.DEMO_AUTH_PASSWORD = "povod-demo";

  const [{ initStore }, { createApp }, { resetRateLimits }] = await Promise.all([
    import("../store.js"),
    import("../app.js"),
    import("../auth/rateLimit.js"),
  ]);
  await initStore();
  // Limiter'ы — синглтоны: без сброса отправка упирается в лимит соседнего теста.
  resetRateLimits();

  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const port = (server.address() as AddressInfo).port;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

interface Account {
  token: string;
  id: string;
}

let accountCounter = 0;

async function register(baseUrl: string, name: string): Promise<Account> {
  accountCounter += 1;
  const response = await fetch(`${baseUrl}/api/Auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      email: `dm-${accountCounter}-${Date.now()}@povod.test`,
      password: "long-enough-password",
    }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string; user: { id: string } };
  return { token: body.token, id: body.user.id };
}

const authorized = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...init.headers,
  },
});

/** Двое становятся друзьями по-настоящему: заявка и согласие (SEC-012). */
async function befriend(baseUrl: string, left: Account, right: Account): Promise<void> {
  const requested = await fetch(
    `${baseUrl}/api/Users/${left.id}/friends`,
    authorized(left.token, { method: "POST", body: JSON.stringify({ friendId: right.id }) }),
  );
  assert.ok([200, 201].includes(requested.status), `заявка: ${requested.status}`);

  const accepted = await fetch(
    `${baseUrl}/api/Users/${right.id}/friends/requests/${left.id}/accept`,
    authorized(right.token, { method: "POST" }),
  );
  assert.equal(accepted.status, 204);
}

const send = (baseUrl: string, from: Account, toId: string, text: string) =>
  fetch(
    `${baseUrl}/api/Messages`,
    authorized(from.token, { method: "POST", body: JSON.stringify({ recipientId: toId, text }) }),
  );

test("друзья переписываются", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);

  const sent = await send(baseUrl, alice, boris.id, "привет");
  assert.equal(sent.status, 201);
  const message = (await sent.json()) as { id: string; text: string; senderId: string };
  assert.equal(message.text, "привет");
  assert.equal(message.senderId, alice.id);

  const thread = await fetch(`${baseUrl}/api/Messages/dialog/${alice.id}`, authorized(boris.token));
  assert.equal(thread.status, 200);
  const body = (await thread.json()) as { items: { id: string }[]; canSend: boolean };
  assert.deepEqual(
    body.items.map((item) => item.id),
    [message.id],
  );
  assert.equal(body.canSend, true);
});

test("незнакомцу написать нельзя, и отказ ничего о нём не сообщает", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const stranger = await register(baseUrl, "Незнакомец");

  const denied = await send(baseUrl, alice, stranger.id, "привет");
  const missing = await send(baseUrl, alice, "нет-такого-пользователя", "привет");

  assert.equal(denied.status, 404);
  assert.equal(missing.status, 404);
  // Ответы обязаны совпадать дословно: разница выдала бы, что аккаунт есть.
  assert.deepEqual(await denied.json(), await missing.json());
});

test("самому себе написать нельзя", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  assert.equal((await send(baseUrl, alice, alice.id, "заметка")).status, 404);
});

test("пустое сообщение не проходит валидацию", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);

  // Одни пробелы: в памяти такое записалось бы, в PostgreSQL упало бы на CHECK.
  assert.equal((await send(baseUrl, alice, boris.id, "   ")).status, 400);
  assert.equal((await send(baseUrl, alice, boris.id, "x".repeat(2001))).status, 400);
});

test("посторонний не открывает чужую переписку", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  const mallory = await register(baseUrl, "Мэллори");
  await befriend(baseUrl, alice, boris);
  await send(baseUrl, alice, boris.id, "секрет");

  // Мэллори знает идентификатор — и всё равно не видит ни переписки, ни того,
  // что она существует.
  const peek = await fetch(`${baseUrl}/api/Messages/dialog/${boris.id}`, authorized(mallory.token));
  assert.equal(peek.status, 404);
});

test("непрочитанные считаются и обнуляются, повтор ничего не меняет", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);
  await send(baseUrl, alice, boris.id, "раз");
  await send(baseUrl, alice, boris.id, "два");

  const unread = async (account: Account) => {
    const response = await fetch(`${baseUrl}/api/Messages/unread`, authorized(account.token));
    assert.equal(response.status, 200);
    return ((await response.json()) as { unread: number }).unread;
  };

  assert.equal(await unread(boris), 2);
  assert.equal(await unread(alice), 0);

  for (const attempt of [1, 2]) {
    const read = await fetch(
      `${baseUrl}/api/Messages/dialog/${alice.id}/read`,
      authorized(boris.token, { method: "POST" }),
    );
    assert.equal(read.status, 204, `попытка ${attempt}`);
  }
  assert.equal(await unread(boris), 0);
});

test("список диалогов показывает собеседника без чужого email", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);
  await send(baseUrl, alice, boris.id, "привет");

  const response = await fetch(`${baseUrl}/api/Messages`, authorized(boris.token));
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    items: {
      peer: { id: string; email?: string };
      unread: number;
      lastMessage: { text: string };
    }[];
    unread: number;
  };

  assert.equal(body.items.length, 1);
  assert.equal(body.items[0]?.peer.id, alice.id);
  assert.equal(body.items[0]?.lastMessage.text, "привет");
  assert.equal(body.items[0]?.unread, 1);
  assert.equal(body.unread, 1);
  // Чужой email наружу не уходит нигде — здесь тоже.
  assert.equal(body.items[0]?.peer.email, undefined);
});

test("курсор доводит до конца истории без потерь", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);

  const expected: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const response = await send(baseUrl, alice, boris.id, `сообщение ${index}`);
    expected.push(((await response.json()) as { id: string }).id);
  }

  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${baseUrl}/api/Messages/dialog/${alice.id}`);
    url.searchParams.set("limit", "2");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, authorized(boris.token));
    const body = (await response.json()) as { items: { id: string }[]; nextCursor?: string };
    seen.push(...body.items.map((item) => item.id));
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }

  assert.equal(new Set(seen).size, seen.length, "страницы не повторяют сообщения");
  assert.deepEqual([...seen].sort(), [...expected].sort());
});

test("битый курсор отдаёт первую страницу, а не ошибку", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);
  await send(baseUrl, alice, boris.id, "привет");

  const url = new URL(`${baseUrl}/api/Messages/dialog/${alice.id}`);
  url.searchParams.set("cursor", "совершенно не курсор");
  const response = await fetch(url, authorized(boris.token));
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { items: unknown[] }).items.length, 1);
});

test("править и удалять можно только своё", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);

  const sent = await send(baseUrl, alice, boris.id, "опечятка");
  const { id } = (await sent.json()) as { id: string };

  // Получатель — не автор: подменять чужие слова, оставляя чужое имя, нельзя.
  const foreign = await fetch(
    `${baseUrl}/api/Messages/${id}`,
    authorized(boris.token, { method: "PUT", body: JSON.stringify({ text: "подмена" }) }),
  );
  assert.equal(foreign.status, 404);
  assert.equal(
    (await fetch(`${baseUrl}/api/Messages/${id}`, authorized(boris.token, { method: "DELETE" })))
      .status,
    404,
  );

  const edited = await fetch(
    `${baseUrl}/api/Messages/${id}`,
    authorized(alice.token, { method: "PUT", body: JSON.stringify({ text: "опечатка" }) }),
  );
  assert.equal(edited.status, 200);
  const updated = (await edited.json()) as { text: string; editedAt?: string };
  assert.equal(updated.text, "опечатка");
  assert.ok(updated.editedAt, "правка обязана оставлять отметку");

  assert.equal(
    (await fetch(`${baseUrl}/api/Messages/${id}`, authorized(alice.token, { method: "DELETE" })))
      .status,
    204,
  );
});

test("расторжение дружбы закрывает отправку, но история остаётся", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);
  await send(baseUrl, alice, boris.id, "пока дружили");

  const removed = await fetch(
    `${baseUrl}/api/Users/${boris.id}/friends/${alice.id}`,
    authorized(boris.token, { method: "DELETE" }),
  );
  assert.equal(removed.status, 204);

  assert.equal((await send(baseUrl, alice, boris.id, "уже нет")).status, 404);

  const thread = await fetch(`${baseUrl}/api/Messages/dialog/${boris.id}`, authorized(alice.token));
  assert.equal(thread.status, 200);
  const body = (await thread.json()) as { items: { text: string }[]; canSend: boolean };
  assert.deepEqual(
    body.items.map((item) => item.text),
    ["пока дружили"],
  );
  assert.equal(body.canSend, false, "интерфейс обязан узнать, что писать больше нельзя");
});

test("гостя не пускают ни к одному маршруту", async (context) => {
  const { baseUrl } = await startTestApp(context);
  for (const path of ["/api/Messages", "/api/Messages/unread", "/api/Messages/dialog/u2"]) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 401, path);
  }
});

test("отправка из браузера требует CSRF-токен", async (context) => {
  const { baseUrl } = await startTestApp(context);

  // Вход «как из браузера»: наружу отдаются куки (SEC-001).
  const login = await fetch(`${baseUrl}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "elmira@povod.app", password: "povod-demo" }),
  });
  assert.equal(login.status, 200);
  const { csrfToken } = (await login.json()) as { csrfToken: string };
  const headers = login.headers as Headers & { getSetCookie?: () => string[] };
  const directives = headers.getSetCookie
    ? headers.getSetCookie()
    : (headers.get("set-cookie") ?? "").split(/,(?=[^;]+?=)/).filter(Boolean);
  const cookieHeader = directives.map((directive) => directive.split(";")[0]).join("; ");

  const body = JSON.stringify({ recipientId: "u2", text: "привет" });
  // Демо-пользователь u1 дружит с u2 в seed, поэтому отказ здесь может быть
  // только из-за CSRF — иначе тест проверял бы не то.
  const withoutToken = await fetch(`${baseUrl}/api/Messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body,
  });
  assert.equal(withoutToken.status, 403);

  const withToken = await fetch(`${baseUrl}/api/Messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
      "X-CSRF-Token": csrfToken,
    },
    body,
  });
  assert.equal(withToken.status, 201);
});

test("расторжение дружбы закрывает и правку, а не только отправку", async (context) => {
  /*
   * Дыра, найденная состязательным разбором уже готовой фичи.
   *
   * `POST` после расторжения отвечал 404, а `PUT` — нет: переписав все прежние
   * реплики, человек продолжал доставлять текст тому, кто его отфрендил, и
   * текст доезжал следующим опросом переписки. «Убрать из друзей» —
   * единственный доступный жертве рычаг, блокировок в продукте нет.
   */
  const { baseUrl } = await startTestApp(context);
  const abuser = await register(baseUrl, "Абьюзер");
  const victim = await register(baseUrl, "Жертва");
  await befriend(baseUrl, abuser, victim);

  const sent = await send(baseUrl, abuser, victim.id, "привет");
  const { id } = (await sent.json()) as { id: string };

  const unfriended = await fetch(
    `${baseUrl}/api/Users/${victim.id}/friends/${abuser.id}`,
    authorized(victim.token, { method: "DELETE" }),
  );
  assert.equal(unfriended.status, 204);

  const edit = await fetch(
    `${baseUrl}/api/Messages/${id}`,
    authorized(abuser.token, { method: "PUT", body: JSON.stringify({ text: "травля" }) }),
  );
  assert.equal(edit.status, 404, "правка обязана закрываться вместе с отправкой");

  // Текст в переписке жертвы не изменился.
  const thread = await fetch(
    `${baseUrl}/api/Messages/dialog/${abuser.id}`,
    authorized(victim.token),
  );
  const body = (await thread.json()) as { items: { text: string }[] };
  assert.deepEqual(
    body.items.map((item) => item.text),
    ["привет"],
  );
});

test("удалить своё можно и после расторжения дружбы", async (context) => {
  // Обратная сторона правила: запрет запер бы слова отфренженного человека в
  // чужой переписке навсегда.
  const { baseUrl } = await startTestApp(context);
  const author = await register(baseUrl, "Автор");
  const peer = await register(baseUrl, "Собеседник");
  await befriend(baseUrl, author, peer);

  const sent = await send(baseUrl, author, peer.id, "хочу забрать");
  const { id } = (await sent.json()) as { id: string };

  await fetch(
    `${baseUrl}/api/Users/${peer.id}/friends/${author.id}`,
    authorized(peer.token, { method: "DELETE" }),
  );

  const removed = await fetch(
    `${baseUrl}/api/Messages/${id}`,
    authorized(author.token, { method: "DELETE" }),
  );
  assert.equal(removed.status, 204);
});

test("курсор с невнятной датой отдаёт первую страницу, а не 500", async (context) => {
  /*
   * `createdAt` проверялся только на тип, поэтому строка вроде «не-дата»
   * доезжала до SQL как `$2::timestamptz`: PostgreSQL отвечал 22007, а клиент
   * получал 500 на собственноручно испорченном параметре. In-memory адаптер
   * при этом спокойно отдавал 200 — расхождение, заметное только в бою.
   */
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");
  const boris = await register(baseUrl, "Борис");
  await befriend(baseUrl, alice, boris);
  await send(baseUrl, alice, boris.id, "привет");

  const broken = Buffer.from(JSON.stringify({ id: "a", createdAt: "не-дата" }), "utf8").toString(
    "base64url",
  );
  const url = new URL(`${baseUrl}/api/Messages/dialog/${alice.id}`);
  url.searchParams.set("cursor", broken);

  const response = await fetch(url, authorized(boris.token));
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { items: unknown[] }).items.length, 1);
});

test("переписка не оседает в кэше браузера", async (context) => {
  // На общем устройстве кэшированные ответы переживут выход из аккаунта.
  const { baseUrl } = await startTestApp(context);
  const alice = await register(baseUrl, "Алиса");

  for (const path of ["/api/Messages", "/api/Messages/unread"]) {
    const response = await fetch(`${baseUrl}${path}`, authorized(alice.token));
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});
