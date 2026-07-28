import assert from "node:assert/strict";
import test from "node:test";
import { createMailTransport, createResendTransport } from "./transport.js";
import { passwordResetMessage } from "./message.js";

const message = passwordResetMessage("user@example.com", "https://povod.example/reset?token=t", 1);

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
  const transport = createMailTransport({
    mailTransport: "console",
    resendApiKey: "",
    mailFrom: "",
  });
  assert.equal(transport.name, "console");
  await transport.send(message);
});

test("none transport silently drops the message", async () => {
  const transport = createMailTransport({ mailTransport: "none", resendApiKey: "", mailFrom: "" });
  assert.equal(transport.name, "none");
  await transport.send(message);
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
