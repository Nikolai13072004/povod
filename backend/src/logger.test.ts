import assert from "node:assert/strict";
import test from "node:test";

import { REDACTED, redactText, redactValue } from "./logger.js";

test("redactText hides bearer tokens", () => {
  assert.equal(
    redactText("Authorization header was Bearer abc123.DEF-456_xyz"),
    `Authorization header was Bearer ${REDACTED}`,
  );
});

test("redactText hides credentials inside connection URLs", () => {
  assert.equal(
    redactText("connect postgres://povod:s3cr3t@db.internal:5432/povod"),
    `connect postgres://povod:${REDACTED}@db.internal:5432/povod`,
  );
  assert.equal(
    redactText("redis://user:hunter2@cache:6379"),
    `redis://user:${REDACTED}@cache:6379`,
  );
});

test("redactText hides sensitive query and key=value pairs", () => {
  assert.equal(
    redactText("/api/Auth/vk?sign=deadBEEF&vk_user_id=42"),
    `/api/Auth/vk?sign=${REDACTED}&vk_user_id=42`,
  );
  assert.equal(redactText("password=supersecret"), `password=${REDACTED}`);
  assert.equal(redactText("token: abc.def.ghi"), `token: ${REDACTED}`);
  assert.equal(redactText("access_token=zzz&page=2"), `access_token=${REDACTED}&page=2`);
});

test("redactText masks email addresses (PII)", () => {
  assert.equal(redactText("user elmira@povod.app registered"), `user ${REDACTED} registered`);
});

test("redactText leaves non-sensitive text untouched", () => {
  const clean = "GET /api/Events 200 3.21 ms - 512";
  assert.equal(redactText(clean), clean);
});

test("redactValue hides sensitive object keys case-insensitively", () => {
  const redacted = redactValue({
    id: "u1",
    name: "Эльмира",
    email: "elmira@povod.app",
    password: "plaintext",
    Authorization: "Bearer xyz",
    API_KEY: "abc",
    sign: "deadbeef",
    passwordHash: "scrypt$...",
  }) as Record<string, unknown>;

  assert.equal(redacted.id, "u1");
  assert.equal(redacted.name, "Эльмира");
  assert.equal(redacted.email, REDACTED);
  assert.equal(redacted.password, REDACTED);
  assert.equal(redacted.Authorization, REDACTED);
  assert.equal(redacted.API_KEY, REDACTED);
  assert.equal(redacted.sign, REDACTED);
  assert.equal(redacted.passwordHash, REDACTED);
});

test("redactValue does not over-redact lookalike keys", () => {
  const redacted = redactValue({
    authorId: "u1",
    design: "grid",
    assignee: "u2",
  }) as Record<string, unknown>;

  assert.equal(redacted.authorId, "u1");
  assert.equal(redacted.design, "grid");
  assert.equal(redacted.assignee, "u2");
});

test("redactValue recurses into nested objects and arrays", () => {
  const redacted = redactValue({
    session: { token: "raw-token", user: { email: "a@b.com" } },
    items: [{ secret: "x" }, { keep: "y" }],
  }) as {
    session: { token: string; user: { email: string } };
    items: Array<Record<string, string>>;
  };

  assert.equal(redacted.session.token, REDACTED);
  assert.equal(redacted.session.user.email, REDACTED);
  assert.equal(redacted.items[0]?.secret, REDACTED);
  assert.equal(redacted.items[1]?.keep, "y");
});

test("redactValue redacts free-text secrets inside string values", () => {
  const redacted = redactValue({
    url: "/login?password=hunter2",
    note: "call me at hi@povod.app",
  }) as Record<string, string>;

  assert.equal(redacted.url, `/login?password=${REDACTED}`);
  assert.equal(redacted.note, `call me at ${REDACTED}`);
});

test("redactValue safely serialises Error objects and redacts their fields", () => {
  const error = new Error("insert failed for user elmira@povod.app") as Error & {
    code?: string;
    detail?: string;
  };
  error.code = "23505";
  error.detail = "Key (email)=(elmira@povod.app) already exists.";

  const redacted = redactValue(error) as Record<string, unknown>;
  assert.equal(redacted.name, "Error");
  assert.equal(redacted.message, `insert failed for user ${REDACTED}`);
  assert.equal(redacted.code, "23505");
  assert.equal(redacted.detail, `Key (email)=(${REDACTED}) already exists.`);
  assert.ok(typeof redacted.stack === "string");
});

test("redactValue tolerates circular references", () => {
  const node: Record<string, unknown> = { name: "root" };
  node.self = node;
  const redacted = redactValue(node) as Record<string, unknown>;
  assert.equal(redacted.name, "root");
  assert.equal(redacted.self, "[Circular]");
});

test("redactValue passes through primitives unchanged", () => {
  assert.equal(redactValue(42), 42);
  assert.equal(redactValue(true), true);
  assert.equal(redactValue(null), null);
  assert.equal(redactValue(undefined), undefined);
});
