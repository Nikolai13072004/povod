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
