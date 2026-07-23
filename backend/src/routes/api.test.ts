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

  const [{ initStore }, { createApp }] = await Promise.all([
    import("../store"),
    import("../app"),
  ]);
  await initStore();

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

test("session lifecycle supports login, lookup and logout", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const sessionResponse = await fetch(
    `${baseUrl}/api/Auth/session`,
    authorized(token),
  );
  assert.equal(sessionResponse.status, 200);
  const session = (await sessionResponse.json()) as { user: { id: string } };
  assert.equal(session.user.id, "u1");

  const logoutResponse = await fetch(
    `${baseUrl}/api/Auth/logout`,
    authorized(token, { method: "POST" }),
  );
  assert.equal(logoutResponse.status, 204);

  const revokedResponse = await fetch(
    `${baseUrl}/api/Auth/session`,
    authorized(token),
  );
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
  assert.deepEqual(mine.created.map((event) => event.id), ["1"]);
  assert.deepEqual(
    mine.attending.map((event) => event.id).sort(),
    ["1", "3"],
  );

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
  };
  assert.equal(event.participants, 2);
  assert.deepEqual(event.participantIds.sort(), ["u1", "u2"]);
});

test("mutations require a session and enforce event ownership", async (context) => {
  const { baseUrl } = await startTestApp(context);

  const anonymousCreate = await fetch(`${baseUrl}/api/Events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Без автора", date: "23/07/26" }),
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
        date: "24/07/26",
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
        date: "25/07/26",
        format: "private",
      }),
    }),
  );
  assert.equal(createResponse.status, 201);
  const event = (await createResponse.json()) as { id: string };

  const anonymousEvent = await fetch(`${baseUrl}/api/Events/${event.id}`);
  assert.equal(anonymousEvent.status, 404);
  const ownerEvent = await fetch(
    `${baseUrl}/api/Events/${event.id}`,
    authorized(token),
  );
  assert.equal(ownerEvent.status, 200);

  const usersResponse = await fetch(`${baseUrl}/api/Users`);
  const users = (await usersResponse.json()) as Array<Record<string, unknown>>;
  assert.equal(usersResponse.status, 200);
  assert.equal(users.some((user) => "email" in user), false);
});

test("event API reports invalid dates after authentication", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const response = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        title: "Некорректное событие",
        date: "31/02/26",
        time: "12:00",
      }),
    }),
  );
  assert.equal(response.status, 400);
});
