import assert from "node:assert/strict";
import test from "node:test";
import { createMailTransport, createResendTransport } from "./transport.js";
import { createBrevoTransport, parseSender } from "./brevo.js";
import { createSmtpTransport } from "./smtp.js";
import { passwordResetMessage } from "./message.js";

const message = passwordResetMessage("user@example.com", "https://povod.example/reset?token=t", 1);

/** Ненужные для конкретной проверки поля конфигурации. */
const emptyMailConfig = {
  resendApiKey: "",
  brevoApiKey: "",
  mailFrom: "",
  smtpHost: "",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "",
  smtpPassword: "",
};

function stubFetch(response: Response, calls: Array<[string, RequestInit]>): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push([String(url), init]);
    return response;
  }) as unknown as typeof fetch;
}

test("resend transport posts the message to the API", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const transport = createResendTransport({
    apiKey: "re_secret",
    from: "POVOD <no-reply@povod.example>",
    fetchImpl: stubFetch(new Response("{}", { status: 200 }), calls),
  });

  await transport.send(message);

  assert.equal(calls.length, 1);
  const [url, init] = calls[0]!;
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.method, "POST");
  assert.equal(
    (init.headers as Record<string, string>).authorization,
    "Bearer re_secret",
    "ключ уходит в заголовке, а не в теле или query",
  );

  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  assert.deepEqual(body.to, ["user@example.com"], "получатель приходит списком, как ждёт Resend");
  assert.equal(body.from, "POVOD <no-reply@povod.example>");
  assert.equal(body.subject, message.subject);
  // Письмо без текстовой версии чаще попадает в спам, чем доходит.
  assert.ok(String(body.text).includes("https://povod.example/reset?token=t"));
  assert.ok(String(body.html).includes("https://povod.example/reset?token=t"));
});

test("resend transport reports why the provider refused", async () => {
  // Голый код статуса не говорит, что чинить: домен не подтверждён, адрес не
  // разрешён на free-плане и просроченный ключ выглядели бы одинаково.
  const transport = createResendTransport({
    apiKey: "re_secret",
    from: "no-reply@povod.example",
    fetchImpl: stubFetch(
      new Response('{"message":"Domain is not verified"}', {
        status: 403,
        statusText: "Forbidden",
      }),
      [],
    ),
  });

  await assert.rejects(transport.send(message), /403[\s\S]*Domain is not verified/);
});

test("console transport does not reach the network", async () => {
  const transport = createMailTransport({ ...emptyMailConfig, mailTransport: "console" });
  assert.equal(transport.name, "console");
  await transport.send(message);
});

test("none transport silently drops the message", async () => {
  const transport = createMailTransport({ ...emptyMailConfig, mailTransport: "none" });
  assert.equal(transport.name, "none");
  await transport.send(message);
});

test("brevo transport posts through HTTP, not SMTP", async () => {
  /*
   * Render с сентября 2025 блокирует исходящий трафик на SMTP-порты для
   * бесплатных сервисов: соединение уходит и не возвращается (ETIMEDOUT на
   * фазе CONN). HTTP API работает поверх 443 и под запрет не попадает.
   */
  const calls: Array<[string, RequestInit]> = [];
  const transport = createBrevoTransport({
    apiKey: "brevo-secret",
    from: "POVOD <me@gmail.com>",
    fetchImpl: stubFetch(new Response('{"messageId":"1"}', { status: 201 }), calls),
  });

  await transport.send(message);

  const [url, init] = calls[0]!;
  assert.equal(url, "https://api.brevo.com/v3/smtp/email");
  assert.equal((init.headers as Record<string, string>)["api-key"], "brevo-secret");

  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  // Отправитель разбирается на имя и адрес: Brevo ждёт их отдельными полями.
  assert.deepEqual(body.sender, { name: "POVOD", email: "me@gmail.com" });
  assert.deepEqual(body.to, [{ email: "user@example.com" }]);
  assert.ok(String(body.textContent).includes("https://povod.example/reset?token=t"));
});

test("brevo transport reports why the provider refused", async () => {
  // «Адрес отправителя не подтверждён» и «квота исчерпана» по коду статуса
  // неразличимы, а чинятся по-разному.
  const transport = createBrevoTransport({
    apiKey: "brevo-secret",
    from: "me@gmail.com",
    fetchImpl: stubFetch(
      new Response('{"message":"Sender not valid"}', { status: 400, statusText: "Bad Request" }),
      [],
    ),
  });

  await assert.rejects(transport.send(message), /400[\s\S]*Sender not valid/);
});

test("brevo sender parses both plain and named addresses", () => {
  assert.deepEqual(parseSender("me@gmail.com"), { email: "me@gmail.com" });
  assert.deepEqual(parseSender("POVOD <me@gmail.com>"), { name: "POVOD", email: "me@gmail.com" });
  assert.deepEqual(parseSender("  <me@gmail.com>"), { email: "me@gmail.com" });
});

test("smtp transport sends through one reused connection", async () => {
  // Рукопожатие TLS с аутентификацией стоит сотни миллисекунд, а восстановление
  // пароля его дожидается — открывать соединение на каждое письмо расточительно.
  const sent: Record<string, unknown>[] = [];
  let created = 0;
  const transport = createSmtpTransport({
    host: "smtp.yandex.ru",
    port: 465,
    secure: true,
    user: "me@yandex.ru",
    password: "app-password",
    from: "POVOD <me@yandex.ru>",
    resolveHost: async () => "142.250.185.109",
    createTransport: ((options: Record<string, unknown>) => {
      created += 1;
      // Без явных таймаутов повисший сервер держал бы наш ответ минутами.
      assert.equal(options.connectionTimeout, 10_000);
      assert.equal(options.socketTimeout, 10_000);
      /*
       * Подключаемся по адресу, а не по имени: у контейнеров Render нет
       * исходящего IPv6, а Gmail отдаёт и AAAA — Node шёл по нему и падал с
       * ENETUNREACH. Имя при этом остаётся в servername, иначе проверка
       * сертификата не пройдёт: в host теперь цифры.
       */
      assert.equal(options.host, "142.250.185.109");
      assert.deepEqual(options.tls, { servername: "smtp.yandex.ru" });
      return {
        sendMail: async (mail: Record<string, unknown>) => {
          sent.push(mail);
          return {};
        },
      };
    }) as never,
  });

  await transport.send(message);
  await transport.send(message);

  assert.equal(created, 1, "соединение создаётся один раз");
  assert.equal(sent.length, 2);
  assert.equal(sent[0]!.from, "POVOD <me@yandex.ru>");
  assert.equal(sent[0]!.to, "user@example.com");
  assert.equal(sent[0]!.subject, message.subject);
});

test("password reset message names the lifetime and the way out", async () => {
  // Человек, открывший почту назавтра, должен понимать, почему ссылка не
  // сработала, а не считать это поломкой.
  assert.ok(message.text.includes("час"));
  assert.ok(message.text.includes("не запрашивали"));
  assert.equal(message.to, "user@example.com");
});

test("password reset message escapes the link it embeds", () => {
  const dangerous = passwordResetMessage(
    "user@example.com",
    'https://povod.example/reset?token=a"><script>alert(1)</script>',
    1,
  );

  assert.ok(!dangerous.html.includes("<script>"), "ссылка не должна вырываться из атрибута href");
  assert.ok(dangerous.html.includes("&quot;"));
});
