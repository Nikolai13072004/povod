import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";

test("config applies safe development defaults", () => {
  const config = loadConfig({});

  assert.equal(config.port, 8080);
  assert.equal(config.nodeEnv, "development");
  assert.equal(config.demoAuthEnabled, true);
  assert.equal(config.databaseSsl, "auto");
});

test("config parses explicit booleans and numeric values", () => {
  const config = loadConfig({
    PORT: "9090",
    PERSIST: "false",
    ENABLE_EXTERNAL_EVENTS: "false",
    AUTH_SESSION_DAYS: "14",
  });

  assert.equal(config.port, 9090);
  assert.equal(config.persist, false);
  assert.equal(config.externalEvents, false);
  assert.equal(config.authSessionDays, 14);
});

test("config rejects unsafe production settings", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        CORS_ORIGIN: "*",
        DEMO_AUTH_ENABLED: "true",
      }),
    /CORS_ORIGIN[\s\S]*DEMO_AUTH_ENABLED/,
  );
});

test("config accepts explicit safe production settings", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    CORS_ORIGIN: "https://povod.example",
    DEMO_AUTH_ENABLED: "false",
    MAIL_TRANSPORT: "none",
    APP_URL: "https://povod.example",
  });

  assert.equal(config.corsOrigin, "https://povod.example");
  assert.equal(config.demoAuthEnabled, false);
  assert.equal(config.appUrl, "https://povod.example");
});

test("config refuses a mail transport that only writes to the log in production", () => {
  // Иначе восстановление пароля «работает»: человек видит «письмо отправлено»,
  // а ссылка уходит в лог сервера и никому не приходит (SEC-008).
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://povod.example",
        DEMO_AUTH_ENABLED: "false",
      }),
    /MAIL_TRANSPORT/,
  );
});

test("config refuses the resend transport without a key or sender", () => {
  // Не отложенная ошибка на первом забытом пароле, а отказ на старте.
  assert.throws(() => loadConfig({ MAIL_TRANSPORT: "resend" }), /RESEND_API_KEY[\s\S]*MAIL_FROM/);
  assert.throws(
    () => loadConfig({ MAIL_TRANSPORT: "resend", MAIL_FROM: "POVOD <no-reply@povod.example>" }),
    /RESEND_API_KEY/,
  );
});

test("config accepts both plain and named sender addresses", () => {
  const plain = loadConfig({
    MAIL_TRANSPORT: "resend",
    RESEND_API_KEY: "re_test",
    MAIL_FROM: "no-reply@povod.example",
  });
  assert.equal(plain.mailFrom, "no-reply@povod.example");

  const named = loadConfig({
    MAIL_TRANSPORT: "resend",
    RESEND_API_KEY: "re_test",
    MAIL_FROM: "POVOD <no-reply@povod.example>",
  });
  assert.equal(named.mailTransport, "resend");
  assert.equal(named.resendApiKey, "re_test");

  assert.throws(() => loadConfig({ MAIL_FROM: "povod.example" }), /MAIL_FROM/);
  assert.throws(() => loadConfig({ MAIL_FROM: "a@b, c@d" }), /MAIL_FROM/);
});

test("config allows the resend transport in production", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    CORS_ORIGIN: "https://povod.example",
    DEMO_AUTH_ENABLED: "false",
    APP_URL: "https://povod.example",
    MAIL_TRANSPORT: "resend",
    RESEND_API_KEY: "re_test",
    MAIL_FROM: "POVOD <no-reply@povod.example>",
  });

  assert.equal(config.mailTransport, "resend");
});

test("config refuses an incomplete smtp setup", () => {
  assert.throws(
    () => loadConfig({ MAIL_TRANSPORT: "smtp" }),
    /SMTP_HOST[\s\S]*SMTP_USER[\s\S]*SMTP_PASSWORD[\s\S]*MAIL_FROM/,
  );
});

test("config requires the smtp sender to match the authenticated mailbox", () => {
  // Яндекс и Gmail отклоняют чужого отправителя либо молча подменяют адрес —
  // и то и другое обнаруживается уже на живых письмах.
  const base = {
    MAIL_TRANSPORT: "smtp",
    SMTP_HOST: "smtp.yandex.ru",
    SMTP_USER: "me@yandex.ru",
    SMTP_PASSWORD: "app-password",
  };
  assert.throws(() => loadConfig({ ...base, MAIL_FROM: "someone@else.ru" }), /MAIL_FROM/);

  const config = loadConfig({ ...base, MAIL_FROM: "POVOD <me@yandex.ru>" });
  assert.equal(config.mailTransport, "smtp");
  assert.equal(config.smtpHost, "smtp.yandex.ru");
  assert.equal(config.smtpPort, 465, "по умолчанию порт TLS");
  assert.equal(config.smtpSecure, true);
});

test("config rejects an app URL that is not a bare origin", () => {
  // Из APP_URL собираются ссылки в письмах — путь или query там всё сломают.
  assert.throws(() => loadConfig({ APP_URL: "https://povod.example/app" }), /APP_URL/);
  assert.equal(loadConfig({}).appUrl, "http://localhost:5173");
});

test("config rejects malformed values", () => {
  assert.throws(() => loadConfig({ PORT: "invalid" }), /PORT/);
  assert.throws(() => loadConfig({ DATABASE_SSL: "sometimes" }), /DATABASE_SSL/);
  assert.throws(() => loadConfig({ DATABASE_URL: "not-a-url" }), /DATABASE_URL/);
});

test("предел регистраций нельзя ослабить в production", () => {
  const productionEnv = {
    NODE_ENV: "production",
    CORS_ORIGIN: "https://povod.example",
    DEMO_AUTH_ENABLED: "false",
    MAIL_TRANSPORT: "none",
    APP_URL: "https://povod.example",
  };

  // Настройка заведена ради синтетических окружений: e2e заводит десяток
  // аккаунтов подряд с одного адреса. Оставь её без проверки — и защита от
  // перебора регистраций снимается одной переменной окружения.
  assert.throws(
    () => loadConfig({ ...productionEnv, AUTH_REGISTER_LIMIT: "1000" }),
    /AUTH_REGISTER_LIMIT/,
  );

  // Ужесточить можно: запрещено именно ослабление.
  assert.equal(loadConfig({ ...productionEnv, AUTH_REGISTER_LIMIT: "2" }).authRegisterLimit, 2);
  assert.equal(loadConfig({}).authRegisterLimit, 5, "боевое значение по умолчанию");
});
