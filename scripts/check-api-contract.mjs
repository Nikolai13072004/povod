import assert from "node:assert/strict";

const apiBaseUrl = normalizeBaseUrl(process.env.API_URL || "http://localhost:8080/");
const authEmail = process.env.CONTRACT_AUTH_EMAIL || "";
const authPassword = process.env.CONTRACT_AUTH_PASSWORD || "";
const requestTimeoutMs = Number(process.env.CONTRACT_TIMEOUT_MS || 5000);

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_URL must use HTTP or HTTPS");
  }
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

async function request(path, options = {}) {
  const response = await fetch(new URL(path, apiBaseUrl), {
    signal: AbortSignal.timeout(requestTimeoutMs),
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = response.status === 204 ? undefined : await response.json();
  return { response, payload };
}

function assertEvent(event) {
  assert.equal(typeof event.id, "string", "event.id must be a string");
  assert.equal(typeof event.title, "string", "event.title must be a string");
  assert.equal(typeof event.startsAt, "string", "event.startsAt must be an ISO string");
  assert.ok(Number.isFinite(Date.parse(event.startsAt)), "event.startsAt must be parseable");
  assert.equal(typeof event.timezone, "string", "event.timezone must be a string");
  assert.equal("date" in event, false, "legacy event.date must not be exposed");
  assert.equal("time" in event, false, "legacy event.time must not be exposed");
  assert.ok(Array.isArray(event.participantIds), "event.participantIds must be an array");
}

async function checkPublicContract() {
  const health = await request("health");
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.status, "ok");
  assert.equal(typeof health.payload.service, "string");
  assert.equal(typeof health.payload.database_enabled, "boolean");

  const ping = await request("api/ping");
  assert.equal(ping.response.status, 200);
  assert.equal(ping.payload.message, "pong");

  const events = await request("api/Events");
  assert.equal(events.response.status, 200);
  assert.ok(Array.isArray(events.payload), "GET /api/Events must return an array");
  events.payload.slice(0, 10).forEach(assertEvent);

  return events.payload.length;
}

async function checkAuthenticatedContract() {
  if (!authEmail && !authPassword) return "skipped";
  assert.ok(authEmail && authPassword, "set both CONTRACT_AUTH_EMAIL and CONTRACT_AUTH_PASSWORD");

  const login = await request("api/Auth/login", {
    method: "POST",
    body: JSON.stringify({ email: authEmail, password: authPassword }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(typeof login.payload.token, "string");
  assert.equal(typeof login.payload.expiresAt, "string");
  assert.equal(typeof login.payload.user?.id, "string");

  const headers = { Authorization: `Bearer ${login.payload.token}` };
  try {
    const session = await request("api/Auth/session", { headers });
    assert.equal(session.response.status, 200);
    assert.equal(session.payload.user.id, login.payload.user.id);

    const mine = await request("api/Events/mine", { headers });
    assert.equal(mine.response.status, 200);
    assert.ok(Array.isArray(mine.payload.created));
    assert.ok(Array.isArray(mine.payload.attending));
    [...mine.payload.created, ...mine.payload.attending].slice(0, 10).forEach(assertEvent);
  } finally {
    await request("api/Auth/logout", { method: "POST", headers });
  }

  return "passed";
}

try {
  const eventCount = await checkPublicContract();
  const authenticated = await checkAuthenticatedContract();
  console.log(`API contract passed: ${eventCount} public events; auth ${authenticated}.`);
} catch (error) {
  console.error("API contract failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
