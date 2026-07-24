import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";

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
    import("../store"),
    import("../app"),
    import("../auth/rateLimit"),
  ]);
  await initStore();
  resetRateLimits(); // изоляция: limiter'ы — синглтоны, чистим счётчики между тестами

  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const port = (server.address() as AddressInfo).port;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

async function loginDemo(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "elmira@povod.app",
      password: "povod-demo",
    }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { token: string };
  assert.ok(body.token);
  return body.token;
}

const authorized = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...init.headers,
  },
});

/** Регистрирует нового пользователя (по умолчанию — «атакующего») и возвращает его токен и id. */
async function registerUser(
  baseUrl: string,
  overrides: { name?: string; email?: string; password?: string } = {},
): Promise<{ token: string; id: string }> {
  const response = await fetch(`${baseUrl}/api/Auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: overrides.name ?? "Мэллори",
      email: overrides.email ?? "mallory@povod.app",
      password: overrides.password ?? "attacker-password",
    }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string; user: { id: string } };
  assert.ok(body.token);
  return { token: body.token, id: body.user.id };
}

test("session lifecycle supports login, lookup and logout", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const sessionResponse = await fetch(`${baseUrl}/api/Auth/session`, authorized(token));
  assert.equal(sessionResponse.status, 200);
  const session = (await sessionResponse.json()) as { user: { id: string } };
  assert.equal(session.user.id, "u1");

  const logoutResponse = await fetch(
    `${baseUrl}/api/Auth/logout`,
    authorized(token, { method: "POST" }),
  );
  assert.equal(logoutResponse.status, 204);

  const revokedResponse = await fetch(`${baseUrl}/api/Auth/session`, authorized(token));
  assert.equal(revokedResponse.status, 401);
});

test("event API uses authenticated normalized participation", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const mineResponse = await fetch(`${baseUrl}/api/Events/mine`, authorized(token));
  assert.equal(mineResponse.status, 200);
  const mine = (await mineResponse.json()) as {
    created: Array<{ id: string }>;
    attending: Array<{ id: string }>;
  };
  assert.deepEqual(
    mine.created.map((event) => event.id),
    ["1"],
  );
  assert.deepEqual(mine.attending.map((event) => event.id).sort(), ["1", "3"]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const joinResponse = await fetch(
      `${baseUrl}/api/Events/2/join`,
      authorized(token, { method: "POST" }),
    );
    assert.equal(joinResponse.status, 200);
  }

  const eventResponse = await fetch(`${baseUrl}/api/Events/2`, authorized(token));
  const event = (await eventResponse.json()) as {
    participants: number;
    participantIds: string[];
    startsAt: string;
    timezone: string;
    date?: string;
    time?: string;
  };
  assert.equal(event.participants, 2);
  assert.deepEqual(event.participantIds.sort(), ["u1", "u2"]);
  assert.equal(event.startsAt, "2026-06-28T19:00:00.000Z");
  assert.equal(event.timezone, "Europe/Moscow");
  assert.equal(event.date, undefined);
  assert.equal(event.time, undefined);
});

test("mutations require a session and enforce event ownership", async (context) => {
  const { baseUrl } = await startTestApp(context);

  const anonymousCreate = await fetch(`${baseUrl}/api/Events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Без автора",
      startsAt: "2026-07-23T12:00:00.000Z",
    }),
  });
  assert.equal(anonymousCreate.status, 401);

  const registerResponse = await fetch(`${baseUrl}/api/Auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Новый пользователь",
      email: "new-user@povod.app",
      password: "secure-password",
    }),
  });
  assert.equal(registerResponse.status, 201);
  const registered = (await registerResponse.json()) as { token: string };

  const createOwnEvent = await fetch(
    `${baseUrl}/api/Events`,
    authorized(registered.token, {
      method: "POST",
      body: JSON.stringify({
        title: "Событие нового пользователя",
        startsAt: "2026-07-24T12:00:00.000Z",
        timezone: "Europe/Moscow",
        authorId: "u1",
      }),
    }),
  );
  assert.equal(createOwnEvent.status, 201);
  const ownEvent = (await createOwnEvent.json()) as { authorId: string };
  assert.notEqual(ownEvent.authorId, "u1");

  const editForeignEvent = await fetch(
    `${baseUrl}/api/Events/1`,
    authorized(registered.token, {
      method: "PUT",
      body: JSON.stringify({ title: "Чужое название" }),
    }),
  );
  assert.equal(editForeignEvent.status, 403);
});

test("private events and user emails are not exposed publicly", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const createResponse = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        title: "Закрытая встреча",
        startsAt: "2026-07-25T12:00:00.000Z",
        timezone: "Europe/Moscow",
        format: "private",
      }),
    }),
  );
  assert.equal(createResponse.status, 201);
  const event = (await createResponse.json()) as { id: string };

  const anonymousEvent = await fetch(`${baseUrl}/api/Events/${event.id}`);
  assert.equal(anonymousEvent.status, 404);
  const ownerEvent = await fetch(`${baseUrl}/api/Events/${event.id}`, authorized(token));
  assert.equal(ownerEvent.status, 200);

  const usersResponse = await fetch(`${baseUrl}/api/Users`);
  const users = (await usersResponse.json()) as Array<Record<string, unknown>>;
  assert.equal(usersResponse.status, 200);
  assert.equal(
    users.some((user) => "email" in user),
    false,
  );
});

test("event API requires an ISO instant and valid timezone", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const response = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        title: "Некорректное событие",
        startsAt: "31/02/26 12:00",
        timezone: "Invalid/Timezone",
      }),
    }),
  );
  assert.equal(response.status, 400);
});

test("responses carry helmet security headers", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("content-security-policy"));
  assert.ok(response.headers.get("x-frame-options"));
});

// --- Horizontal privilege escalation (SEC-006) ---------------------------------
// Сид: событие «1» и комментарии c1/c2 принадлежат u1/u2/u3. «Атакующий» — новый
// зарегистрированный пользователь, не связанный с этими сущностями. Он не должен
// иметь возможности читать или изменять чужие ресурсы по их id.

test("escalation: a non-author cannot delete another user's event", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const attacker = await registerUser(baseUrl);

  // Событие «1» создано u1.
  const forbidden = await fetch(
    `${baseUrl}/api/Events/1`,
    authorized(attacker.token, { method: "DELETE" }),
  );
  assert.equal(forbidden.status, 403);

  // Событие должно остаться на месте.
  const stillThere = await fetch(`${baseUrl}/api/Events/1`);
  assert.equal(stillThere.status, 200);
});

test("escalation: a non-author cannot edit another user's event", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const attacker = await registerUser(baseUrl);

  const forbidden = await fetch(
    `${baseUrl}/api/Events/1`,
    authorized(attacker.token, {
      method: "PUT",
      body: JSON.stringify({ title: "Захвачено" }),
    }),
  );
  assert.equal(forbidden.status, 403);

  const event = (await (await fetch(`${baseUrl}/api/Events/1`)).json()) as { title: string };
  assert.notEqual(event.title, "Захвачено");
});

test("escalation: participant listing is scoped to the authenticated user", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const attacker = await registerUser(baseUrl);

  const forbidden = await fetch(`${baseUrl}/api/Events/participant/u1`, authorized(attacker.token));
  assert.equal(forbidden.status, 403);
});

test("escalation: a stranger cannot delete someone else's comment", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const attacker = await registerUser(baseUrl);

  // Комментарий c1 написан u2 к событию «1» (автор u1). Атакующий — ни тот, ни другой.
  const forbidden = await fetch(
    `${baseUrl}/api/Comments/c1`,
    authorized(attacker.token, { method: "DELETE" }),
  );
  assert.equal(forbidden.status, 403);

  // Комментарий должен остаться.
  const comments = (await (await fetch(`${baseUrl}/api/Comments/event/1`)).json()) as Array<{
    id: string;
  }>;
  assert.ok(comments.some((comment) => comment.id === "c1"));
});

test("authorization: an event author may moderate comments on their own event", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl); // u1 — автор события «1»

  // c1 — чужой комментарий (u2) на событии u1: автор события вправе его удалить.
  const response = await fetch(
    `${baseUrl}/api/Comments/c1`,
    authorized(owner, { method: "DELETE" }),
  );
  assert.equal(response.status, 204);
});

test("escalation: a user cannot delete or modify another account", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const attacker = await registerUser(baseUrl);

  const deleteOther = await fetch(
    `${baseUrl}/api/Users/u1`,
    authorized(attacker.token, { method: "DELETE" }),
  );
  assert.equal(deleteOther.status, 403);

  const addFriendForOther = await fetch(
    `${baseUrl}/api/Users/u1/friends`,
    authorized(attacker.token, { method: "POST", body: JSON.stringify({ friendId: "u2" }) }),
  );
  assert.equal(addFriendForOther.status, 403);

  const removeFriendForOther = await fetch(
    `${baseUrl}/api/Users/u1/friends/u2`,
    authorized(attacker.token, { method: "DELETE" }),
  );
  assert.equal(removeFriendForOther.status, 403);
});

test("escalation: private events stay inaccessible to uninvited users", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl); // u1
  const attacker = await registerUser(baseUrl);

  const createResponse = await fetch(
    `${baseUrl}/api/Events`,
    authorized(owner, {
      method: "POST",
      body: JSON.stringify({
        title: "Секретная встреча",
        startsAt: "2026-08-01T12:00:00.000Z",
        timezone: "Europe/Moscow",
        format: "private",
      }),
    }),
  );
  assert.equal(createResponse.status, 201);
  const privateEvent = (await createResponse.json()) as { id: string };

  // Прямое чтение скрыто (404, а не 403 — чтобы не раскрывать существование).
  const read = await fetch(`${baseUrl}/api/Events/${privateEvent.id}`, authorized(attacker.token));
  assert.equal(read.status, 404);

  // Запись на событие требует приглашения.
  const join = await fetch(
    `${baseUrl}/api/Events/${privateEvent.id}/join`,
    authorized(attacker.token, { method: "POST" }),
  );
  assert.equal(join.status, 403);

  // Комментирование заблокировано.
  const comment = await fetch(
    `${baseUrl}/api/Comments`,
    authorized(attacker.token, {
      method: "POST",
      body: JSON.stringify({ eventId: privateEvent.id, text: "впустите меня" }),
    }),
  );
  assert.equal(comment.status, 403);

  // Список комментариев скрыт.
  const comments = await fetch(
    `${baseUrl}/api/Comments/event/${privateEvent.id}`,
    authorized(attacker.token),
  );
  assert.equal(comments.status, 404);
});
