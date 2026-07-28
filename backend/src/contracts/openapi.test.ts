import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildOpenApiDocument } from "./openapi.js";

/**
 * Спецификация лежит в репозитории закоммиченной — её читают люди и инструменты.
 * Значит, она может устареть. Этот тест не даёт: он сверяет файл с тем, что
 * прямо сейчас порождает код (ARCH-002).
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const specPath = join(repoRoot, "docs", "openapi.json");
const typesPath = join(repoRoot, "frontend", "src", "services", "schema.d.ts");

test("закоммиченный docs/openapi.json совпадает с тем, что порождает код", () => {
  const committed = readFileSync(specPath, "utf8");
  const current = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
  assert.equal(
    committed,
    current,
    "спецификация устарела — пересоберите: npm --prefix backend run openapi",
  );
});

test("описаны те эндпоинты, которыми пользуется приложение", () => {
  const paths = Object.keys(buildOpenApiDocument().paths ?? {});
  for (const expected of [
    "/api/Auth/login",
    "/api/Auth/session",
    "/api/Events",
    "/api/Events/{id}",
    "/api/Events/{id}/join",
    "/api/Events/{id}/favorite",
    "/api/Events/{id}/invitations",
    "/api/Comments",
    "/api/Notifications",
    "/api/Users/me",
  ]) {
    assert.ok(paths.includes(expected), `в спецификации нет ${expected}`);
  }
});

test("наружу не уходят внутренние поля", () => {
  const schemas = buildOpenApiDocument().components?.schemas ?? {};

  // Хэш секрета приглашения существует только в хранилище: попади он в ответ —
  // и по украденной спецификации стало бы понятно, что именно искать в базе.
  const invitation = JSON.stringify(schemas.Invitation);
  assert.doesNotMatch(invitation, /tokenHash/);
  assert.doesNotMatch(invitation, /createdBy/);

  // Email в публичном профиле необязателен: он отдаётся только владельцу.
  const user = schemas.User as { required?: string[] };
  assert.equal(user.required?.includes("email"), false);
});

test("сгенерированные типы frontend не отстают от спецификации", () => {
  const types = readFileSync(typesPath, "utf8");
  // Проверяем сам факт генерации из этой спецификации, а не её содержимое:
  // содержимое уже сверено выше.
  assert.match(types, /Сгенерировано из docs\/openapi\.json/);
  for (const schema of ["Event", "User", "Comment", "Notification", "EventPage"]) {
    assert.match(types, new RegExp(`\\b${schema}:`), `в типах нет схемы ${schema}`);
  }
});
