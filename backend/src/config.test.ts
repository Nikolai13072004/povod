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
  });

  assert.equal(config.corsOrigin, "https://povod.example");
  assert.equal(config.demoAuthEnabled, false);
});

test("config rejects malformed values", () => {
  assert.throws(() => loadConfig({ PORT: "invalid" }), /PORT/);
  assert.throws(() => loadConfig({ DATABASE_SSL: "sometimes" }), /DATABASE_SSL/);
  assert.throws(() => loadConfig({ DATABASE_URL: "not-a-url" }), /DATABASE_URL/);
});
