import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresRepository } from "./postgresRepository.js";

/**
 * Проверки самого SQL ленты — без базы (BE-003).
 *
 * Интеграционные тесты требуют PostgreSQL и потому пропускаются локально: из-за
 * этого в CI однажды уехал запрос с `ORDER BY 0`, который PostgreSQL читает как
 * «сортировать по нулевой колонке списка выборки» и отклоняет. Здесь запрос
 * перехватывается поддельным пулом, так что подобная ошибка ловится обычным
 * `npm test` — до того, как дойдёт до сервера.
 */

interface Captured {
  text: string;
  values: unknown[];
}

function repositoryWithCapture(): { repository: PostgresRepository; queries: Captured[] } {
  const queries: Captured[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { repository: new PostgresRepository(pool), queries };
}

/**
 * Сортировка самого запроса — то место, где голое число меняет смысл.
 * Берём последнее вхождение: внутри выборки есть свой `ORDER BY`
 * (`array_agg(... ORDER BY ep.joined_at)`), и он к порядку ленты не относится.
 */
function orderByClause(sql: string): string {
  const start = sql.toUpperCase().lastIndexOf("ORDER BY");
  if (start < 0) return "";
  const tail = sql.slice(start + "ORDER BY".length);
  const limitAt = tail.toUpperCase().indexOf("LIMIT");
  return (limitAt < 0 ? tail : tail.slice(0, limitAt)).trim().replace(/\s+/g, " ");
}

test("feed ordering never puts a bare number first (это номер колонки, а не значение)", async () => {
  const { repository, queries } = repositoryWithCapture();

  await repository.listEvents({});
  await repository.listEvents({ limit: 5 });
  await repository.listEvents({ preferInterests: ["Музыка"], limit: 5 });
  await repository.listEvents({ sort: "asc" });

  for (const { text } of queries) {
    const order = orderByClause(text);
    assert.ok(order.length > 0, "запрос ленты обязан быть упорядоченным");
    assert.doesNotMatch(
      order,
      /^\d/,
      `ORDER BY начинается с числа — PostgreSQL примет его за номер колонки: ${order}`,
    );
  }
});

test("without interests the feed sorts exactly by the indexed pair", async () => {
  const { repository, queries } = repositoryWithCapture();
  await repository.listEvents({ limit: 5 });

  // Ровно тот порядок, под который заведён индекс events_feed_cursor_idx.
  assert.equal(orderByClause(queries[0].text), "e.created_at DESC, e.id DESC");
});

test("with interests the rank leads the ordering", async () => {
  const { repository, queries } = repositoryWithCapture();
  await repository.listEvents({ preferInterests: ["Музыка"], limit: 5 });

  const order = orderByClause(queries[0].text);
  assert.match(order, /^\(CASE WHEN/, "ранг по интересам должен идти первым");
  assert.match(order, /e\.created_at DESC, e\.id DESC$/);
});

test("the cursor comparison matches the ordering it pages through", async () => {
  const cursor = { matchesInterests: false, createdAt: "2026-06-01T10:00:00.000Z", id: "7" };

  const plain = repositoryWithCapture();
  await plain.repository.listEvents({ limit: 5, cursor });
  // Без интересов сравнивается пара — ровно та же, что и в ORDER BY.
  assert.match(plain.queries[0].text, /\(e\.created_at, e\.id\) < \(\$\d+, \$\d+\)/);
  assert.ok(plain.queries[0].values.includes(cursor.id));

  const ranked = repositoryWithCapture();
  await ranked.repository.listEvents({ limit: 5, cursor, preferInterests: ["Музыка"] });
  // С интересами — тройка, иначе граница страницы разошлась бы с сортировкой.
  assert.match(ranked.queries[0].text, /, e\.created_at, e\.id\) < \(\$\d+, \$\d+, \$\d+\)/);
});

test("search uses full-text matching, not a bare substring (BE-012)", async () => {
  const { repository, queries } = repositoryWithCapture();
  await repository.listEvents({ search: "концерт" });

  const [{ text, values }] = queries;
  // websearch_to_tsquery не бросает исключение на произвольном вводе — в отличие
  // от to_tsquery, которому достаточно одинокой скобки.
  assert.match(text, /websearch_to_tsquery\('russian', \$\d+\)/);
  assert.match(text, /search_vector @@/);
  assert.ok(values.includes("концерт"), "запрос передаётся параметром, а не склейкой");
});
