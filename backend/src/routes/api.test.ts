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
    import("../store.js"),
    import("../app.js"),
    import("../auth/rateLimit.js"),
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

/** Заголовки `Set-Cookie` ответа: имя куки → полная директива. */
function setCookies(response: Response): Map<string, string> {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const directives = headers.getSetCookie
    ? headers.getSetCookie()
    : (headers.get("set-cookie") ?? "").split(/,(?=[^;]+?=)/).filter(Boolean);
  const result = new Map<string, string>();
  for (const directive of directives) {
    const name = directive.split("=")[0]?.trim();
    if (name) result.set(name, directive);
  }
  return result;
}

function cookieValue(directive: string): string {
  return (
    directive
      .slice(directive.indexOf("=") + 1)
      .split(";")[0]
      ?.trim() ?? ""
  );
}

interface BrowserSession {
  cookieHeader: string;
  csrf: string;
  setCookie: Map<string, string>;
}

/** Вход демо-пользователя «как из браузера»: наружу отдаются куки, а не токен (SEC-001). */
async function loginWithCookies(baseUrl: string): Promise<BrowserSession> {
  const response = await fetch(`${baseUrl}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "elmira@povod.app", password: "povod-demo" }),
  });
  assert.equal(response.status, 200);
  await response.json();

  const setCookie = setCookies(response);
  const session = cookieValue(setCookie.get("povod_session") ?? "");
  const csrf = cookieValue(setCookie.get("povod_csrf") ?? "");
  assert.ok(session, "ожидалась кука povod_session");
  assert.ok(csrf, "ожидалась кука povod_csrf");
  return {
    cookieHeader: `povod_session=${session}; povod_csrf=${csrf}`,
    csrf,
    setCookie,
  };
}

/** Запрос из браузера: куки + (для изменяющих методов) заголовок double submit. */
const withCookies = (
  browser: BrowserSession,
  init: RequestInit = {},
  csrf = browser.csrf,
): RequestInit => ({
  ...init,
  headers: {
    "Content-Type": "application/json",
    Cookie: browser.cookieHeader,
    ...(csrf ? { "X-CSRF-Token": csrf } : {}),
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

test("login puts the session into an HttpOnly cookie and CSRF into a readable one", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const browser = await loginWithCookies(baseUrl);

  const sessionCookie = browser.setCookie.get("povod_session") ?? "";
  const csrfCookie = browser.setCookie.get("povod_csrf") ?? "";

  // Главное свойство SEC-001: токен недоступен скриптам на странице.
  assert.match(sessionCookie, /HttpOnly/i);
  assert.doesNotMatch(csrfCookie, /HttpOnly/i);

  for (const cookie of [sessionCookie, csrfCookie]) {
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);
    assert.match(cookie, /Expires=/i); // не сессионная кука — переживает перезапуск вкладки
  }

  // CSRF-кука не должна быть самим токеном: иначе HttpOnly теряет смысл.
  assert.notEqual(cookieValue(csrfCookie), cookieValue(sessionCookie));
});

test("the login response carries the CSRF token the server will expect", async (context) => {
  /*
   * Кросс-доменное развёртывание: фронт на одном домене, API на другом. Куку
   * povod_csrf ставит домен API, и `document.cookie` на фронте её НЕ ВИДИТ —
   * там только куки своего домена. Сессионную куку браузер при этом шлёт,
   * поэтому сервер требует заголовок, а взять его фронту было неоткуда: любой
   * изменяющий запрос упирался в 403. Поймано на настоящем деплое.
   */
  const { baseUrl } = await startTestApp(context);
  const response = await fetch(`${baseUrl}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "elmira@povod.app", password: "povod-demo" }),
  });
  const body = (await response.json()) as { csrfToken?: string };
  assert.ok(body.csrfToken, "ответ на вход обязан нести CSRF-токен");

  // Значение должно совпадать с кукой — сервер сверяет заголовок именно с ней.
  const cookies = setCookies(response);
  assert.equal(body.csrfToken, cookieValue(cookies.get("povod_csrf") ?? ""));

  // И оно должно проходить проверку: имитируем фронт, который куку не читает,
  // а берёт токен из тела ответа.
  const session = cookieValue(cookies.get("povod_session") ?? "");
  const write = await fetch(`${baseUrl}/api/Events/2/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `povod_session=${session}`,
      "X-CSRF-Token": body.csrfToken!,
    },
  });
  assert.notEqual(write.status, 403, "токен из тела ответа обязан проходить проверку");
});

test("a cookie session authenticates requests without the Authorization header", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const browser = await loginWithCookies(baseUrl);

  const response = await fetch(`${baseUrl}/api/Auth/session`, withCookies(browser));
  assert.equal(response.status, 200);
  const session = (await response.json()) as { user: { id: string } };
  assert.equal(session.user.id, "u1");
});

test("cookie-authenticated writes require a matching CSRF header", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const browser = await loginWithCookies(baseUrl);

  // Так выглядит запрос, подделанный чужим сайтом: куку браузер приложит сам,
  // а заголовок поставить неоткуда — читать нашу куку с другого origin нельзя.
  const forged = await fetch(
    `${baseUrl}/api/Events/2/join`,
    withCookies(browser, { method: "POST" }, ""),
  );
  assert.equal(forged.status, 403);

  const wrongToken = await fetch(
    `${baseUrl}/api/Events/2/join`,
    withCookies(browser, { method: "POST" }, "not-the-right-token"),
  );
  assert.equal(wrongToken.status, 403);

  const allowed = await fetch(
    `${baseUrl}/api/Events/2/join`,
    withCookies(browser, { method: "POST" }),
  );
  assert.equal(allowed.status, 200);

  // Чтение не трогаем: GET проверку не проходит и работать не перестал.
  const read = await fetch(`${baseUrl}/api/Events/2`, withCookies(browser, {}, ""));
  assert.equal(read.status, 200);
});

test("a stale session cookie without its CSRF pair does not lock the user out", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const browser = await loginWithCookies(baseUrl);

  // Видимую CSRF-куку стёрли (расширение, чистка кук), HttpOnly-кука осталась.
  const stale: BrowserSession = { ...browser, cookieHeader: browser.cookieHeader.split(";")[0]! };

  const relogin = await fetch(
    `${baseUrl}/api/Auth/login`,
    withCookies(
      stale,
      {
        method: "POST",
        body: JSON.stringify({ email: "elmira@povod.app", password: "povod-demo" }),
      },
      "", // заголовка нет: копировать его больше неоткуда
    ),
  );
  // Иначе — ловушка: чтобы войти, нужен токен, который выдаётся только при входе.
  assert.equal(relogin.status, 200);

  // И вход действительно чинит состояние: пришла свежая пара кук.
  const reissued = setCookies(relogin);
  assert.ok(cookieValue(reissued.get("povod_session") ?? ""));
  assert.ok(cookieValue(reissued.get("povod_csrf") ?? ""));
});

test("Bearer clients keep working without CSRF headers", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  // VK Mini App и не-браузерные клиенты ходят с заголовком Authorization: его
  // чужой сайт подставить не может, поэтому double submit там не нужен.
  const response = await fetch(
    `${baseUrl}/api/Events/2/join`,
    authorized(token, { method: "POST" }),
  );
  assert.equal(response.status, 200);
});

test("logout clears both cookies and revokes the server session", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const browser = await loginWithCookies(baseUrl);

  const logout = await fetch(
    `${baseUrl}/api/Auth/logout`,
    withCookies(browser, { method: "POST" }),
  );
  assert.equal(logout.status, 204);

  const cleared = setCookies(logout);
  for (const name of ["povod_session", "povod_csrf"]) {
    const directive = cleared.get(name) ?? "";
    assert.ok(directive, `logout должен сбрасывать куку ${name}`);
    assert.equal(cookieValue(directive), "");
  }

  // Сброс куки — только половина дела: сессия отозвана и на сервере.
  const replayed = await fetch(`${baseUrl}/api/Auth/session`, withCookies(browser));
  assert.equal(replayed.status, 401);
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
  // Свойство, а не точный набор id: сид-события меняются под демо.
  assert.ok(mine.created.length > 0, "у демо-пользователя есть созданные события");
  assert.ok(mine.attending.length > 0, "и посещаемые");

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
  // Дата сида теперь относительная (генерируется от старта сервера), поэтому
  // проверяем формат, а не конкретное значение: ISO 8601 со смещением.
  assert.match(event.startsAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
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

  // Каталог пользователей закрыт от анонимов: раньше он отвечал кому угодно и
  // выгружал имена, аватары, города и связи всего сервиса одним запросом.
  const anonymousUsers = await fetch(`${baseUrl}/api/Users`);
  assert.equal(anonymousUsers.status, 401);

  const usersResponse = await fetch(`${baseUrl}/api/Users`, authorized(token));
  const users = (await usersResponse.json()) as Array<Record<string, unknown>>;
  assert.equal(usersResponse.status, 200);
  // Чужой email не уходит наружу даже вошедшему.
  assert.equal(
    users.some((user) => "email" in user),
    false,
  );

  // Список друзей — тоже не публичные данные.
  const anonymousFriends = await fetch(`${baseUrl}/api/Users/u1/friends`);
  assert.equal(anonymousFriends.status, 401);
});

test("friendship needs the other person to agree (SEC-012)", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await loginDemo(baseUrl); // u1
  const bob = await registerUser(baseUrl, { email: "bob@povod.app" });

  const friendsOf = async (token: string, id: string) => {
    const response = await fetch(`${baseUrl}/api/Users/${id}/friends`, authorized(token));
    return ((await response.json()) as { id: string }[]).map((user) => user.id);
  };
  const request = (token: string, id: string, friendId: string) =>
    fetch(
      `${baseUrl}/api/Users/${id}/friends`,
      authorized(token, { method: "POST", body: JSON.stringify({ friendId }) }),
    );

  // Заявка не делает людей друзьями: раньше нажатие одного меняло запись второго.
  const requested = await request(bob.token, bob.id, "u1");
  assert.equal(requested.status, 201);
  assert.deepEqual(await requested.json(), { status: "pending" });
  assert.ok(!(await friendsOf(bob.token, bob.id)).includes("u1"));
  assert.ok(!(await friendsOf(alice, "u1")).includes(bob.id));

  // Повторное нажатие идемпотентно.
  assert.equal((await request(bob.token, bob.id, "u1")).status, 200);

  // Заявку видит только адресат, и только свою.
  const incoming = await fetch(`${baseUrl}/api/Users/u1/friends/requests`, authorized(alice));
  const requests = (await incoming.json()) as { incoming: { id: string }[] };
  assert.deepEqual(
    requests.incoming.map((user) => user.id),
    [bob.id],
  );
  const foreign = await fetch(`${baseUrl}/api/Users/u1/friends/requests`, authorized(bob.token));
  assert.equal(foreign.status, 403);

  const accepted = await fetch(
    `${baseUrl}/api/Users/u1/friends/requests/${bob.id}/accept`,
    authorized(alice, { method: "POST" }),
  );
  assert.equal(accepted.status, 204);
  assert.ok((await friendsOf(alice, "u1")).includes(bob.id));
  assert.ok((await friendsOf(bob.token, bob.id)).includes("u1"));

  // Повторное принятие уже нечего принимать.
  const again = await fetch(
    `${baseUrl}/api/Users/u1/friends/requests/${bob.id}/accept`,
    authorized(alice, { method: "POST" }),
  );
  assert.equal(again.status, 404);
});

test("answering an incoming request with your own counts as agreement", async (context) => {
  // Иначе двое, одновременно нажавшие «добавить в друзья», зависли бы каждый со
  // своей заявкой и ждали бы друг друга.
  const { baseUrl } = await startTestApp(context);
  const alice = await loginDemo(baseUrl);
  const bob = await registerUser(baseUrl, { email: "counter@povod.app" });

  await fetch(
    `${baseUrl}/api/Users/${bob.id}/friends`,
    authorized(bob.token, { method: "POST", body: JSON.stringify({ friendId: "u1" }) }),
  );
  const answered = await fetch(
    `${baseUrl}/api/Users/u1/friends`,
    authorized(alice, { method: "POST", body: JSON.stringify({ friendId: bob.id }) }),
  );

  assert.equal(answered.status, 200);
  assert.deepEqual(await answered.json(), { status: "accepted" });

  const friends = await fetch(`${baseUrl}/api/Users/u1/friends`, authorized(alice));
  assert.ok(((await friends.json()) as { id: string }[]).some((user) => user.id === bob.id));
});

test("declining and cancelling a request both remove it", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const alice = await loginDemo(baseUrl);
  const bob = await registerUser(baseUrl, { email: "declined@povod.app" });

  const send = () =>
    fetch(
      `${baseUrl}/api/Users/${bob.id}/friends`,
      authorized(bob.token, { method: "POST", body: JSON.stringify({ friendId: "u1" }) }),
    );
  const pendingFor = async (token: string, id: string) => {
    const response = await fetch(`${baseUrl}/api/Users/${id}/friends/requests`, authorized(token));
    return (await response.json()) as { incoming: unknown[]; outgoing: unknown[] };
  };

  await send();
  // Адресат отклоняет.
  const declined = await fetch(
    `${baseUrl}/api/Users/u1/friends/${bob.id}`,
    authorized(alice, { method: "DELETE" }),
  );
  assert.equal(declined.status, 204);
  assert.equal((await pendingFor(alice, "u1")).incoming.length, 0);

  await send();
  // Автор отзывает свою.
  const cancelled = await fetch(
    `${baseUrl}/api/Users/${bob.id}/friends/u1`,
    authorized(bob.token, { method: "DELETE" }),
  );
  assert.equal(cancelled.status, 204);
  assert.equal((await pendingFor(bob.token, bob.id)).outgoing.length, 0);
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

test("liveness and readiness probes report process and store health (BE-002)", async (context) => {
  const { baseUrl } = await startTestApp(context);

  const liveResponse = await fetch(`${baseUrl}/health/live`);
  assert.equal(liveResponse.status, 200);
  const liveBody = (await liveResponse.json()) as { status: string };
  assert.equal(liveBody.status, "alive");

  const readyResponse = await fetch(`${baseUrl}/health/ready`);
  assert.equal(readyResponse.status, 200);
  const readyBody = (await readyResponse.json()) as { status: string; checks: { store: string } };
  assert.equal(readyBody.status, "ready");
  assert.equal(readyBody.checks.store, "ok");
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

  // Отписка от события, в котором не состоишь, возвращала 200 и ПОЛНОЕ тело
  // чужого приватного события: описание, адрес, список участников. Это был
  // единственный изменяющий маршрут без проверки видимости.
  const leave = await fetch(
    `${baseUrl}/api/Events/${privateEvent.id}/leave`,
    authorized(attacker.token, { method: "POST" }),
  );
  assert.equal(leave.status, 404, "отписка не должна отдавать чужое приватное событие");

  // Снятие отметки «избранное» различало «события нет» (404) и «событие есть,
  // но чужое» (204) — оракул существования, который парный POST закрывает.
  const unfavorite = await fetch(
    `${baseUrl}/api/Events/${privateEvent.id}/favorite`,
    authorized(attacker.token, { method: "DELETE" }),
  );
  assert.equal(unfavorite.status, 404, "снятие отметки не должно подтверждать существование");
});

test("validation: input that the database would reject is refused with 400, not 500", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  // Комментарий из одних пробелов: раньше проходил валидацию, in-memory отдавал
  // 201 и показывал пустую реплику, PostgreSQL отвергал вставку по CHECK — 500.
  const blankComment = await fetch(
    `${baseUrl}/api/Comments`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({ eventId: "1", text: "   " }),
    }),
  );
  assert.equal(blankComment.status, 400);

  const base = {
    startsAt: "2026-08-01T12:00:00.000Z",
    timezone: "Europe/Moscow",
  };

  // Координаты вне диапазона: тот же CHECK в схеме базы, тот же разъезд адаптеров.
  const badCoords = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({ ...base, title: "Точка нигде", coords: [999, 999] }),
    }),
  );
  assert.equal(badCoords.status, 400);

  // Текстовые поля не имели верхней границы вовсе: комментарий и заголовок на
  // мегабайты ограничивал только лимит тела запроса, выбранный под фото.
  const hugeTitle = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({ ...base, title: "я".repeat(5000) }),
    }),
  );
  assert.equal(hugeTitle.status, 400);

  // Заявленный MIME в data URL раньше отбрасывался: проверялись только сигнатуры,
  // а в базу уходила исходная строка вместе с заявленным типом.
  const gifBytes = Buffer.from("GIF89a").toString("base64");
  const lyingMime = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        ...base,
        title: "Обложка-подделка",
        image: `data:text/html;base64,${gifBytes}`,
      }),
    }),
  );
  assert.equal(lyingMime.status, 400, "тип из data URL должен проверяться, а не отбрасываться");
});

/** Лента уведомлений пользователя по токену. */
async function notificationsOf(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/api/Notifications`, authorized(token));
  assert.equal(response.status, 200);
  return (await response.json()) as {
    unread: number;
    items: Array<{
      id: string;
      type: string;
      eventId?: string;
      eventTitle: string;
      actorName?: string;
      changes?: string[];
      readAt?: string;
    }>;
  };
}

test("notifications: joining and commenting reach the event author, not the actor", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl); // Эльмира (u1) — автор события 1
  const guest = await registerUser(baseUrl, { email: "guest@povod.app", name: "Гость" });

  await fetch(`${baseUrl}/api/Events/1/join`, authorized(guest.token, { method: "POST" }));
  await fetch(
    `${baseUrl}/api/Comments`,
    authorized(guest.token, {
      method: "POST",
      body: JSON.stringify({ eventId: "1", text: "иду!" }),
    }),
  );

  const feed = await notificationsOf(baseUrl, owner);
  assert.deepEqual(feed.items.map((item) => item.type).sort(), ["event_comment", "event_joined"]);
  assert.equal(feed.unread, 2);
  assert.equal(feed.items[0].actorName, "Гость");

  // Действия самого автора себе не приходят — иначе лента станет отчётом
  // о собственных нажатиях.
  await fetch(
    `${baseUrl}/api/Comments`,
    authorized(owner, { method: "POST", body: JSON.stringify({ eventId: "1", text: "жду" }) }),
  );
  assert.equal((await notificationsOf(baseUrl, owner)).items.length, 2);

  // Гостю не приходит ничего: он не автор события.
  assert.equal((await notificationsOf(baseUrl, guest.token)).items.length, 0);
});

test("notifications: repeated join does not produce a duplicate", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const guest = await registerUser(baseUrl, { email: "twice@povod.app" });

  // Запись идемпотентна, значит и уведомление должно быть одно.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await fetch(`${baseUrl}/api/Events/1/join`, authorized(guest.token, { method: "POST" }));
  }

  const feed = await notificationsOf(baseUrl, owner);
  assert.equal(feed.items.filter((item) => item.type === "event_joined").length, 1);
});

test("notifications: participants hear about a moved event, but not about a new description", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const guest = await registerUser(baseUrl, { email: "moved@povod.app" });
  await fetch(`${baseUrl}/api/Events/1/join`, authorized(guest.token, { method: "POST" }));

  // Правка описания участника не касается — рассылать её незачем.
  await fetch(
    `${baseUrl}/api/Events/1`,
    authorized(owner, { method: "PUT", body: JSON.stringify({ description: "чуть подробнее" }) }),
  );
  assert.equal((await notificationsOf(baseUrl, guest.token)).items.length, 0);

  await fetch(
    `${baseUrl}/api/Events/1`,
    authorized(owner, {
      method: "PUT",
      body: JSON.stringify({ startsAt: "2026-09-09T18:00:00.000Z", location: "Другое место" }),
    }),
  );

  const feed = await notificationsOf(baseUrl, guest.token);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].type, "event_updated");
  assert.deepEqual(feed.items[0].changes, ["время", "место"]);
});

test("notifications: a cancellation outlives the event it is about", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const guest = await registerUser(baseUrl, { email: "cancelled@povod.app" });

  const created = await fetch(
    `${baseUrl}/api/Events`,
    authorized(owner, {
      method: "POST",
      body: JSON.stringify({
        title: "Отменяемая встреча",
        startsAt: "2026-10-01T12:00:00.000Z",
        timezone: "Europe/Moscow",
        location: "Парк",
      }),
    }),
  );
  const event = (await created.json()) as { id: string };
  await fetch(
    `${baseUrl}/api/Events/${event.id}/join`,
    authorized(guest.token, { method: "POST" }),
  );

  await fetch(`${baseUrl}/api/Events/${event.id}`, authorized(owner, { method: "DELETE" }));

  const feed = await notificationsOf(baseUrl, guest.token);
  const cancelled = feed.items.find((item) => item.type === "event_cancelled");
  assert.ok(cancelled, "участник должен узнать об отмене");
  // Ссылки на удалённое событие нет, но название сохранено — иначе весть об
  // отмене исчезла бы ровно тогда, когда нужнее всего.
  assert.equal(cancelled.eventId, undefined);
  assert.equal(cancelled.eventTitle, "Отменяемая встреча");
});

test("notifications: reading is per user and cannot touch someone else's feed", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const guest = await registerUser(baseUrl, { email: "reader@povod.app" });
  await fetch(`${baseUrl}/api/Events/1/join`, authorized(guest.token, { method: "POST" }));

  const before = await notificationsOf(baseUrl, owner);
  assert.equal(before.unread, 1);

  // Чужой пытается пометить уведомление автора прочитанным по его id.
  const foreign = await fetch(
    `${baseUrl}/api/Notifications/read`,
    authorized(guest.token, {
      method: "POST",
      body: JSON.stringify({ ids: [before.items[0].id] }),
    }),
  );
  assert.equal(foreign.status, 200);
  assert.equal(
    (await notificationsOf(baseUrl, owner)).unread,
    1,
    "чужое чтение не должно засчитаться",
  );

  const counted = await fetch(`${baseUrl}/api/Notifications/unread`, authorized(owner));
  assert.deepEqual(await counted.json(), { unread: 1 });

  const marked = await fetch(
    `${baseUrl}/api/Notifications/read`,
    authorized(owner, { method: "POST", body: JSON.stringify({}) }),
  );
  assert.deepEqual(await marked.json(), { unread: 0 });

  const after = await notificationsOf(baseUrl, owner);
  assert.equal(after.unread, 0);
  assert.ok(after.items[0].readAt, "запись должна получить отметку о прочтении");
});

test("notifications require a session", async (context) => {
  const { baseUrl } = await startTestApp(context);
  assert.equal((await fetch(`${baseUrl}/api/Notifications`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/Notifications/unread`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/Notifications/read`, { method: "POST" })).status, 401);
});

/** Создаёт событие от имени владельца токена и возвращает его. */
async function createEvent(
  baseUrl: string,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; participants: number; endsAt?: string; participantLimit?: number }> {
  const response = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        title: "Событие",
        startsAt: "2026-12-01T12:00:00.000Z",
        timezone: "Europe/Moscow",
        location: "Место",
        ...overrides,
      }),
    }),
  );
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as { id: string; participants: number };
}

test("participant limit: the last seat goes to exactly one of the simultaneous joiners", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  // Лимит 3, автор уже внутри — свободных мест два.
  const event = await createEvent(baseUrl, owner, { participantLimit: 3 });

  const guests = await Promise.all([
    registerUser(baseUrl, { email: "seat1@povod.app" }),
    registerUser(baseUrl, { email: "seat2@povod.app" }),
    registerUser(baseUrl, { email: "seat3@povod.app" }),
  ]);

  const responses = await Promise.all(
    guests.map((guest) =>
      fetch(`${baseUrl}/api/Events/${event.id}/join`, authorized(guest.token, { method: "POST" })),
    ),
  );
  const statuses = responses.map((response) => response.status).sort();
  // Двое записались, третий получил 409 — не 403: дело не в правах, место заняли.
  assert.deepEqual(statuses, [200, 200, 409]);

  const finalEvent = await fetch(`${baseUrl}/api/Events/${event.id}`, authorized(owner));
  assert.equal(((await finalEvent.json()) as { participants: number }).participants, 3);
});

test("participant limit: leaving frees a seat, and the limit cannot drop below the crowd", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const event = await createEvent(baseUrl, owner, { participantLimit: 2 });
  const guest = await registerUser(baseUrl, { email: "freed@povod.app" });
  const late = await registerUser(baseUrl, { email: "late@povod.app" });

  assert.equal(
    (
      await fetch(
        `${baseUrl}/api/Events/${event.id}/join`,
        authorized(guest.token, { method: "POST" }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(
        `${baseUrl}/api/Events/${event.id}/join`,
        authorized(late.token, { method: "POST" }),
      )
    ).status,
    409,
  );

  // Лимит ниже числа записавшихся оставил бы событие в состоянии «мест −1».
  const shrink = await fetch(
    `${baseUrl}/api/Events/${event.id}`,
    authorized(owner, { method: "PUT", body: JSON.stringify({ participantLimit: 1 }) }),
  );
  assert.equal(shrink.status, 400);

  await fetch(
    `${baseUrl}/api/Events/${event.id}/leave`,
    authorized(guest.token, { method: "POST" }),
  );
  assert.equal(
    (
      await fetch(
        `${baseUrl}/api/Events/${event.id}/join`,
        authorized(late.token, { method: "POST" }),
      )
    ).status,
    200,
  );
});

test("event end time is stored and must be after the start", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const event = await createEvent(baseUrl, token, { endsAt: "2026-12-01T15:00:00.000Z" });
  assert.equal(event.endsAt, "2026-12-01T15:00:00.000Z");

  const backwards = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        title: "Задом наперёд",
        startsAt: "2026-12-01T12:00:00.000Z",
        endsAt: "2026-12-01T10:00:00.000Z",
        timezone: "Europe/Moscow",
      }),
    }),
  );
  assert.equal(backwards.status, 400);

  // Перенос одного лишь начала за уже сохранённое окончание тоже недопустим:
  // проверять пару нужно по итоговому виду события, а не по телу запроса.
  const movedStart = await fetch(
    `${baseUrl}/api/Events/${event.id}`,
    authorized(token, {
      method: "PUT",
      body: JSON.stringify({ startsAt: "2026-12-01T18:00:00.000Z" }),
    }),
  );
  assert.equal(movedStart.status, 400);
});

test("invitation opens exactly one private event for its bearer", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const guest = await registerUser(baseUrl, { email: "invited@povod.app" });

  const secret = await createEvent(baseUrl, owner, { title: "Только свои", format: "private" });
  const another = await createEvent(baseUrl, owner, { title: "Тоже закрытое", format: "private" });

  // Без приглашения закрытое событие даже не подтверждает существование.
  assert.equal(
    (await fetch(`${baseUrl}/api/Events/${secret.id}`, authorized(guest.token))).status,
    404,
  );

  const created = await fetch(
    `${baseUrl}/api/Events/${secret.id}/invitations`,
    authorized(owner, { method: "POST", body: JSON.stringify({ maxUses: 1 }) }),
  );
  assert.equal(created.status, 201);
  const { token: invite } = (await created.json()) as { token: string };
  assert.ok(invite);

  const opened = await fetch(
    `${baseUrl}/api/Events/${secret.id}?invite=${invite}`,
    authorized(guest.token),
  );
  assert.equal(opened.status, 200);

  // Приглашение действует ровно для своего события, а не для всех закрытых автора.
  const wrongEvent = await fetch(
    `${baseUrl}/api/Events/${another.id}?invite=${invite}`,
    authorized(guest.token),
  );
  assert.equal(wrongEvent.status, 404);

  const joined = await fetch(
    `${baseUrl}/api/Events/${secret.id}/join?invite=${invite}`,
    authorized(guest.token, { method: "POST" }),
  );
  assert.equal(joined.status, 200);

  // maxUses: 1 — второй по той же ссылке уже не пройдёт.
  const second = await registerUser(baseUrl, { email: "second@povod.app" });
  const exhausted = await fetch(
    `${baseUrl}/api/Events/${secret.id}/join?invite=${invite}`,
    authorized(second.token, { method: "POST" }),
  );
  assert.equal(exhausted.status, 403);
});

test("a single-use invitation lets exactly one person in, even under a race", async (context) => {
  /*
   * Раньше порядок был: проверить счётчик -> записать участника -> израсходовать
   * лимит, причём результат расхода отбрасывался. Двое одновременно проходили
   * проверку (оба видели usedCount=0), оба записывались, и второй оставался
   * участником навсегда, хотя ссылка была на одного.
   */
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const secret = await createEvent(baseUrl, owner, { title: "Один вход", format: "private" });

  const created = await fetch(
    `${baseUrl}/api/Events/${secret.id}/invitations`,
    authorized(owner, { method: "POST", body: JSON.stringify({ maxUses: 1 }) }),
  );
  const { token: invite } = (await created.json()) as { token: string };

  const first = await registerUser(baseUrl, { email: "race-one@povod.app" });
  const second = await registerUser(baseUrl, { email: "race-two@povod.app" });

  const join = (token: string) =>
    fetch(
      `${baseUrl}/api/Events/${secret.id}/join?invite=${invite}`,
      authorized(token, { method: "POST" }),
    );

  const [a, b] = await Promise.all([join(first.token), join(second.token)]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 403], "по одноразовой ссылке должен пройти ровно один");

  // И в самом событии участников ровно двое: автор и прошедший.
  const view = await fetch(`${baseUrl}/api/Events/${secret.id}`, authorized(owner));
  const event = (await view.json()) as { participantIds: string[] };
  assert.equal(event.participantIds.length, 2);
});

test("re-reading a page does not consume an invitation", async (context) => {
  // Обратная сторона: расход перенесён до записи, и уже записанный участник не
  // должен тратить ссылку повторным нажатием — иначе приглашение на пятерых
  // исчерпается, пока один перечитывает страницу.
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const guest = await registerUser(baseUrl, { email: "reread@povod.app" });
  const secret = await createEvent(baseUrl, owner, { title: "Перечитать", format: "private" });

  const created = await fetch(
    `${baseUrl}/api/Events/${secret.id}/invitations`,
    authorized(owner, { method: "POST", body: JSON.stringify({ maxUses: 2 }) }),
  );
  const { token: invite } = (await created.json()) as { token: string };

  const join = () =>
    fetch(
      `${baseUrl}/api/Events/${secret.id}/join?invite=${invite}`,
      authorized(guest.token, { method: "POST" }),
    );

  assert.equal((await join()).status, 200);
  assert.equal((await join()).status, 200, "повторное нажатие идемпотентно");

  const listed = await fetch(`${baseUrl}/api/Events/${secret.id}/invitations`, authorized(owner));
  const [invitation] = (await listed.json()) as { usedCount: number }[];
  assert.equal(invitation.usedCount, 1, "второй заход не должен тратить ссылку");
});

test("invitations are the author's alone and can be revoked", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const guest = await registerUser(baseUrl, { email: "revoked@povod.app" });
  const event = await createEvent(baseUrl, owner, { title: "Закрытое", format: "private" });

  // Посторонний не может ни выдать приглашение, ни увидеть список.
  assert.equal(
    (
      await fetch(
        `${baseUrl}/api/Events/${event.id}/invitations`,
        authorized(guest.token, { method: "POST", body: "{}" }),
      )
    ).status,
    404,
  );

  const created = await fetch(
    `${baseUrl}/api/Events/${event.id}/invitations`,
    authorized(owner, { method: "POST", body: "{}" }),
  );
  const invitation = (await created.json()) as { id: string; token: string };

  const listed = await fetch(`${baseUrl}/api/Events/${event.id}/invitations`, authorized(owner));
  const items = (await listed.json()) as Array<Record<string, unknown>>;
  assert.equal(items.length, 1);
  // Секрет наружу больше не отдаётся — в базе только его хэш.
  assert.equal("token" in items[0], false);

  await fetch(
    `${baseUrl}/api/Events/${event.id}/invitations/${invitation.id}`,
    authorized(owner, { method: "DELETE" }),
  );
  const afterRevoke = await fetch(
    `${baseUrl}/api/Events/${event.id}?invite=${invitation.token}`,
    authorized(guest.token),
  );
  assert.equal(afterRevoke.status, 404, "отозванное приглашение больше не открывает событие");
});

/** Страница ленты по её конверту. */
async function feed(
  baseUrl: string,
  query = "",
  token?: string,
): Promise<{ ids: string[]; nextCursor?: string }> {
  const response = await fetch(
    `${baseUrl}/api/Events${query}`,
    token ? authorized(token) : undefined,
  );
  assert.equal(response.status, 200);
  const page = (await response.json()) as { items: Array<{ id: string }>; nextCursor?: string };
  return { ids: page.items.map((event) => event.id), nextCursor: page.nextCursor };
}

test("feed pages do not skip or repeat events (BE-003)", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  // Сначала узнаём, сколько событий уже в сиде: их число правят под демо, и
  // жёсткая цифра здесь ломалась бы на каждой такой правке.
  const seeded = (await feed(baseUrl, "?limit=50", token)).ids.length;

  const createdCount = 7;
  for (let index = 0; index < createdCount; index += 1) {
    await createEvent(baseUrl, token, { title: `Событие ${index}` });
  }

  const collected: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await feed(baseUrl, `?limit=3${cursor ? `&cursor=${cursor}` : ""}`, token);
    assert.ok(result.ids.length <= 3, "страница не больше запрошенного");
    collected.push(...result.ids);
    cursor = result.nextCursor;
    if (!cursor) break;
  }

  // Ни одного повтора и ни одной потери: всё, что было в сиде, плюс созданные.
  assert.equal(new Set(collected).size, collected.length, "события не должны повторяться");
  assert.equal(collected.length, seeded + createdCount);
  assert.equal(cursor, undefined, "в конце курсора быть не должно");
});

test("feed rejects an oversized limit and survives a broken cursor", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  // Верхняя граница защищает от `?limit=100000`.
  const huge = await feed(baseUrl, "?limit=100000", token);
  assert.ok(huge.ids.length <= 50);

  // Курсор приезжает из адресной строки: испорченный не должен ронять ленту.
  const broken = await feed(baseUrl, "?cursor=%D0%BC%D1%83%D1%81%D0%BE%D1%80", token);
  assert.ok(broken.ids.length > 0, "битый курсор показывает первую страницу");
});

test("search finds an event by a different word form (BE-012)", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);
  await createEvent(baseUrl, token, { title: "Большой концерт", location: "Клуб «Ёлка»" });

  // In-memory адаптер приближает стемминг совпадением по началу слова;
  // в PostgreSQL то же делает морфология русского языка.
  const byPrefix = await feed(baseUrl, "?search=концерт", token);
  assert.ok(byPrefix.ids.length > 0, "«концерт» должен находить «Большой концерт»");

  // Поиск идёт и по месту, а «ё» не должна мешать.
  const byPlace = await feed(baseUrl, "?search=елка", token);
  assert.ok(byPlace.ids.length > 0, "«елка» должна находить «Ёлка»");

  const nothing = await feed(baseUrl, "?search=бухгалтерия", token);
  assert.equal(nothing.ids.length, 0);
});

test("the feed puts events matching the viewer's interests first", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  // Событие по интересу создаём первым — то есть самым старым из двух.
  const wanted = await createEvent(baseUrl, token, { title: "По интересу", category: "Кёрлинг" });
  await createEvent(baseUrl, token, { title: "Свежее, но мимо", category: "Прочее" });

  const before = await feed(baseUrl, "?limit=5", token);
  assert.notEqual(before.ids[0], wanted.id, "без интересов сверху просто самое свежее");

  await fetch(
    `${baseUrl}/api/Users/me`,
    authorized(token, { method: "PUT", body: JSON.stringify({ interests: ["кёрлинг"] }) }),
  );

  const after = await feed(baseUrl, "?limit=5", token);
  assert.equal(after.ids[0], wanted.id, "подходящее по интересам поднимается наверх");
});

/** Перехватывает ссылку восстановления из лога: почтового провайдера нет. */
async function requestReset(baseUrl: string, email: string): Promise<string | undefined> {
  const [{ logger }] = await Promise.all([import("../logger.js")]);
  let link: string | undefined;
  const original = logger.info;
  logger.info = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    const match = line.match(/token=([\w-]+)/);
    if (match) link = match[1];
  };
  try {
    const response = await fetch(`${baseUrl}/api/Auth/password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(response.status, 204);
  } finally {
    logger.info = original;
  }
  return link;
}

test("password reset does not reveal whether an address is registered (SEC-008)", async (context) => {
  const { baseUrl } = await startTestApp(context);

  // Ответ одинаков: иначе форма превращается в проверялку «кто зарегистрирован».
  const known = await requestReset(baseUrl, "elmira@povod.app");
  const unknown = await requestReset(baseUrl, "nobody@povod.app");

  assert.ok(known, "для существующего адреса ссылка выдаётся");
  assert.equal(unknown, undefined, "для чужого адреса ничего не создаётся");
});

test("password reset changes the password once and revokes every session", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const oldToken = await loginDemo(baseUrl);
  const resetToken = await requestReset(baseUrl, "elmira@povod.app");
  assert.ok(resetToken);

  const changed = await fetch(`${baseUrl}/api/Auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "new-strong-password" }),
  });
  assert.equal(changed.status, 204);

  // Смена пароля — способ выгнать того, кто вошёл без спроса.
  assert.equal((await fetch(`${baseUrl}/api/Auth/session`, authorized(oldToken))).status, 401);

  // Старый пароль больше не подходит, новый — подходит.
  const withOld = await fetch(`${baseUrl}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "elmira@povod.app", password: "povod-demo" }),
  });
  assert.equal(withOld.status, 401);

  const withNew = await fetch(`${baseUrl}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "elmira@povod.app", password: "new-strong-password" }),
  });
  assert.equal(withNew.status, 200);

  // Ссылка одноразовая.
  const reused = await fetch(`${baseUrl}/api/Auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "another-password" }),
  });
  assert.equal(reused.status, 400);
});

test("password reset rejects an invented token and a weak password", async (context) => {
  const { baseUrl } = await startTestApp(context);

  const invented = await fetch(`${baseUrl}/api/Auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "выдуманный", password: "long-enough-password" }),
  });
  // Выдуманный, просроченный и использованный токены неотличимы в ответе.
  assert.equal(invented.status, 400);

  const resetToken = await requestReset(baseUrl, "elmira@povod.app");
  const weak = await fetch(`${baseUrl}/api/Auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "1234567" }),
  });
  assert.equal(weak.status, 400, "пароль короче восьми символов принимать нельзя");
});

test("comment editing belongs to its author alone (BE-009)", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl); // автор события 1
  const guest = await registerUser(baseUrl, { email: "commenter@povod.app" });

  const created = await fetch(
    `${baseUrl}/api/Comments`,
    authorized(guest.token, {
      method: "POST",
      body: JSON.stringify({ eventId: "1", text: "Придём вдвоём" }),
    }),
  );
  assert.equal(created.status, 201);
  const comment = (await created.json()) as { id: string; editedAt?: string };
  assert.equal(comment.editedAt, undefined, "новый комментарий не помечен как изменённый");

  const edited = await fetch(
    `${baseUrl}/api/Comments/${comment.id}`,
    authorized(guest.token, { method: "PUT", body: JSON.stringify({ text: "Придём втроём" }) }),
  );
  assert.equal(edited.status, 200);
  const updated = (await edited.json()) as { text: string; editedAt?: string };
  assert.equal(updated.text, "Придём втроём");
  // Отметка о правке, а не молчаливая подмена: собеседники должны видеть,
  // что реплика изменилась после публикации.
  assert.ok(updated.editedAt, "правка должна оставлять отметку");

  // Автор события может комментарий удалить — это модерация, — но не переписать.
  const byEventOwner = await fetch(
    `${baseUrl}/api/Comments/${comment.id}`,
    authorized(owner, { method: "PUT", body: JSON.stringify({ text: "Подменённый текст" }) }),
  );
  assert.equal(byEventOwner.status, 403);

  const stranger = await registerUser(baseUrl, { email: "stranger@povod.app" });
  const byStranger = await fetch(
    `${baseUrl}/api/Comments/${comment.id}`,
    authorized(stranger.token, { method: "PUT", body: JSON.stringify({ text: "Чужой текст" }) }),
  );
  assert.equal(byStranger.status, 403);

  // Удалить автор события всё-таки может.
  const removed = await fetch(
    `${baseUrl}/api/Comments/${comment.id}`,
    authorized(owner, { method: "DELETE" }),
  );
  assert.equal(removed.status, 204);
});

test("comment editing validates the text and the target", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const created = await fetch(
    `${baseUrl}/api/Comments`,
    authorized(token, { method: "POST", body: JSON.stringify({ eventId: "1", text: "Текст" }) }),
  );
  const comment = (await created.json()) as { id: string };

  for (const body of [{ text: "" }, { text: "   " }, {}]) {
    const response = await fetch(
      `${baseUrl}/api/Comments/${comment.id}`,
      authorized(token, { method: "PUT", body: JSON.stringify(body) }),
    );
    assert.equal(response.status, 400, `пустой текст принимать нельзя: ${JSON.stringify(body)}`);
  }

  const missing = await fetch(
    `${baseUrl}/api/Comments/does-not-exist`,
    authorized(token, { method: "PUT", body: JSON.stringify({ text: "Куда-то" }) }),
  );
  assert.equal(missing.status, 404);

  assert.equal(
    (await fetch(`${baseUrl}/api/Comments/${comment.id}`, { method: "PUT" })).status,
    401,
  );
});

test("event creation validates image type and rejects spoofed MIME (SEC-005)", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  // Заявлен image/png, но содержимое — SVG/текст: должно быть отклонено.
  const spoofed = `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`;
  const rejected = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        title: "Поддельное изображение",
        startsAt: "2026-09-01T12:00:00.000Z",
        timezone: "Europe/Moscow",
        image: spoofed,
      }),
    }),
  );
  assert.equal(rejected.status, 400);

  // Настоящая PNG-сигнатура — принимается.
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
  const accepted = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        title: "Валидное изображение",
        startsAt: "2026-09-01T12:00:00.000Z",
        timezone: "Europe/Moscow",
        image: `data:image/png;base64,${png.toString("base64")}`,
      }),
    }),
  );
  assert.equal(accepted.status, 201);
});

test("profile update saves name, city and interests for the owner (BE-010)", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const response = await fetch(
    `${baseUrl}/api/Users/me`,
    authorized(token, {
      method: "PUT",
      body: JSON.stringify({
        name: "Эльмира Г.",
        city: "Казань",
        interests: ["IT", "Музыка"],
      }),
    }),
  );
  assert.equal(response.status, 200);
  const updated = (await response.json()) as {
    id: string;
    name: string;
    city?: string;
    interests?: string[];
  };
  assert.equal(updated.id, "u1");
  assert.equal(updated.name, "Эльмира Г.");
  assert.equal(updated.city, "Казань");
  assert.deepEqual(updated.interests, ["IT", "Музыка"]);

  // Изменения видны и в публичном профиле, но без email.
  const publicUser = (await (await fetch(`${baseUrl}/api/Users/u1`)).json()) as Record<
    string,
    unknown
  >;
  assert.equal(publicUser.name, "Эльмира Г.");
  assert.equal(publicUser.city, "Казань");
  assert.equal("email" in publicUser, false);
});

test("profile update requires a session and validates input (BE-010)", async (context) => {
  const { baseUrl } = await startTestApp(context);

  const anonymous = await fetch(`${baseUrl}/api/Users/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Кто-то" }),
  });
  assert.equal(anonymous.status, 401);

  const token = await loginDemo(baseUrl);

  const tooShort = await fetch(
    `${baseUrl}/api/Users/me`,
    authorized(token, { method: "PUT", body: JSON.stringify({ name: "Я" }) }),
  );
  assert.equal(tooShort.status, 400);

  const empty = await fetch(
    `${baseUrl}/api/Users/me`,
    authorized(token, { method: "PUT", body: JSON.stringify({}) }),
  );
  assert.equal(empty.status, 400);

  // Аватар проходит ту же проверку изображений, что и события (SEC-005).
  const spoofedAvatar = await fetch(
    `${baseUrl}/api/Users/me`,
    authorized(token, {
      method: "PUT",
      body: JSON.stringify({
        avatar: `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`,
      }),
    }),
  );
  assert.equal(spoofedAvatar.status, 400);
});

async function favoritesOf(baseUrl: string, token: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/Events/favorites`, authorized(token));
  assert.equal(response.status, 200);
  return ((await response.json()) as Array<{ id: string }>).map((event) => event.id);
}

test("favorites: adding and removing are idempotent", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  assert.deepEqual(await favoritesOf(baseUrl, token), []);

  // Повторное нажатие не ошибка и не дубль: интерфейс не обязан знать текущее
  // состояние отметки, чтобы её выставить.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/api/Events/2/favorite`,
      authorized(token, { method: "POST" }),
    );
    assert.equal(response.status, 204);
  }
  assert.deepEqual(await favoritesOf(baseUrl, token), ["2"]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/api/Events/2/favorite`,
      authorized(token, { method: "DELETE" }),
    );
    assert.equal(response.status, 204);
  }
  assert.deepEqual(await favoritesOf(baseUrl, token), []);
});

test("favorites are private to their owner and independent of participation", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const other = await registerUser(baseUrl, { email: "fav-other@povod.app" });

  await fetch(`${baseUrl}/api/Events/2/favorite`, authorized(owner, { method: "POST" }));

  // Чужое избранное не видно и не смешивается.
  assert.deepEqual(await favoritesOf(baseUrl, other.token), []);

  // Отметка не означает участие: событие не должно появиться в «Посещаю».
  const mine = await fetch(`${baseUrl}/api/Events/mine`, authorized(owner));
  const { attending } = (await mine.json()) as { attending: Array<{ id: string }> };
  assert.equal(
    attending.some((event) => event.id === "2"),
    false,
  );
});

test("favorites hide a private event instead of revealing it", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const owner = await loginDemo(baseUrl);
  const stranger = await registerUser(baseUrl, { email: "fav-stranger@povod.app" });

  const created = await fetch(
    `${baseUrl}/api/Events`,
    authorized(owner, {
      method: "POST",
      body: JSON.stringify({
        title: "Закрытая встреча",
        startsAt: "2026-11-01T12:00:00.000Z",
        timezone: "Europe/Moscow",
        location: "Дом",
        format: "private",
      }),
    }),
  );
  const event = (await created.json()) as { id: string };

  // 404, а не 403: иначе ответ подтвердил бы существование приватного события.
  const forbidden = await fetch(
    `${baseUrl}/api/Events/${event.id}/favorite`,
    authorized(stranger.token, { method: "POST" }),
  );
  assert.equal(forbidden.status, 404);
  assert.deepEqual(await favoritesOf(baseUrl, stranger.token), []);
});

test("favorites disappear together with the event and require a session", async (context) => {
  const { baseUrl } = await startTestApp(context);
  const token = await loginDemo(baseUrl);

  const created = await fetch(
    `${baseUrl}/api/Events`,
    authorized(token, {
      method: "POST",
      body: JSON.stringify({
        title: "Исчезающее событие",
        startsAt: "2026-11-02T12:00:00.000Z",
        timezone: "Europe/Moscow",
        location: "Парк",
      }),
    }),
  );
  const event = (await created.json()) as { id: string };
  await fetch(`${baseUrl}/api/Events/${event.id}/favorite`, authorized(token, { method: "POST" }));
  assert.deepEqual(await favoritesOf(baseUrl, token), [event.id]);

  await fetch(`${baseUrl}/api/Events/${event.id}`, authorized(token, { method: "DELETE" }));
  // Иначе раздел показывал бы ссылки в никуда.
  assert.deepEqual(await favoritesOf(baseUrl, token), []);

  assert.equal((await fetch(`${baseUrl}/api/Events/favorites`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/Events/2/favorite`, { method: "POST" })).status, 401);
});

test("заявка в друзья и ответ на неё доходят до колокольчика (SEC-015)", async (context) => {
  /*
   * До этого дружба была единственным действием, о котором приложение молчало:
   * заявку можно было увидеть, только зайдя в профиль и заметив блок «Заявки»,
   * а отправитель об ответе не узнавал вовсе.
   */
  const { baseUrl } = await startTestApp(context);
  const alice = await loginDemo(baseUrl); // u1
  const bob = await registerUser(baseUrl, { email: "bob-notify@povod.app" });

  const notificationsOf = async (token: string) => {
    const response = await fetch(`${baseUrl}/api/Notifications`, authorized(token));
    assert.equal(response.status, 200);
    return (await response.json()) as {
      items: { type: string; actorId?: string; eventTitle?: string }[];
      unread: number;
    };
  };

  await fetch(
    `${baseUrl}/api/Users/${bob.id}/friends`,
    authorized(bob.token, { method: "POST", body: JSON.stringify({ friendId: "u1" }) }),
  );

  const forAlice = await notificationsOf(alice);
  const request = forAlice.items.find((item) => item.type === "friend_request");
  assert.ok(request, "адресат заявки обязан получить уведомление");
  assert.equal(request?.actorId, bob.id);
  // У дружбы нет события: колонка названия необязательна ради этого случая.
  assert.equal(request?.eventTitle, undefined);
  assert.ok(forAlice.unread > 0, "значок на колокольчике обязан загореться");

  // Отправитель заявки себе не пишет.
  assert.equal(
    (await notificationsOf(bob.token)).items.some((item) => item.type === "friend_request"),
    false,
  );

  await fetch(
    `${baseUrl}/api/Users/u1/friends/requests/${bob.id}/accept`,
    authorized(alice, { method: "POST" }),
  );

  const forBob = await notificationsOf(bob.token);
  assert.ok(
    forBob.items.some((item) => item.type === "friend_accepted" && item.actorId === "u1"),
    "отправитель заявки обязан узнать об ответе",
  );
});
