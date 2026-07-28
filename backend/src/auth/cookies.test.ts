import assert from "node:assert/strict";
import test from "node:test";
import { csrfTokenFor, csrfTokenMatches, parseCookies } from "./cookies.js";

test("parseCookies reads a browser Cookie header", () => {
  const cookies = parseCookies("povod_session=abc; povod_csrf=def; other=1");
  assert.deepEqual(cookies, { povod_session: "abc", povod_csrf: "def", other: "1" });
});

test("parseCookies handles absent, empty and malformed headers", () => {
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(""), {});
  // Пары без "=" отбрасываются, остальные разбираются как обычно.
  assert.deepEqual(parseCookies("broken; a=1"), { a: "1" });
});

test("parseCookies decodes values and unwraps quotes", () => {
  assert.equal(parseCookies("city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0").city, "Москва");
  assert.equal(parseCookies('token="quoted"').token, "quoted");
  // Некорректный percent-encoding не должен ронять разбор всего заголовка.
  assert.equal(parseCookies("bad=%E0%A4%A; ok=1").bad, "%E0%A4%A");
  assert.equal(parseCookies("bad=%E0%A4%A; ok=1").ok, "1");
});

test("parseCookies keeps the first value of a duplicated name", () => {
  // Подделать значение, дописав вторую куку с тем же именем, не выйдет.
  assert.equal(parseCookies("povod_csrf=real; povod_csrf=forged").povod_csrf, "real");
});

test("csrfTokenFor is deterministic and bound to the session token", () => {
  const token = "session-token-value";
  assert.equal(csrfTokenFor(token), csrfTokenFor(token));
  assert.notEqual(csrfTokenFor(token), csrfTokenFor(`${token}!`));
  // Не должно совпадать с хэшем самого токена: это разные секреты с разной судьбой.
  assert.notEqual(csrfTokenFor(token), token);
  assert.match(csrfTokenFor(token), /^[A-Za-z0-9_-]+$/); // base64url, безопасен для куки
});

test("csrfTokenMatches compares exactly and survives length mismatch", () => {
  const expected = csrfTokenFor("abc");
  assert.equal(csrfTokenMatches(expected, expected), true);
  assert.equal(csrfTokenMatches(expected, ""), false);
  assert.equal(csrfTokenMatches(expected, expected.slice(0, -1)), false);
  assert.equal(csrfTokenMatches(expected, `${expected}x`), false);
  assert.equal(csrfTokenMatches(expected, csrfTokenFor("abd")), false);
});
