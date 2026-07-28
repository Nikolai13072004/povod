/**
 * Копирует в сборку файлы, которые TypeScript не переносит сам.
 *
 * Миграции — обычные `.sql`, и читаются они относительно расположения модуля.
 * Без этого шага собранный сервер поднялся бы, не найдя ни одной миграции, и
 * упал бы уже на подключении к базе.
 */
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = [["src/db/migrations", "dist/db/migrations"]];

for (const [from, to] of assets) {
  const source = join(backendRoot, from);
  if (!existsSync(source)) throw new Error(`нечего копировать: ${from}`);
  cpSync(source, join(backendRoot, to), { recursive: true });
  process.stdout.write(`${from} → ${to}\n`);
}
