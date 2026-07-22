import { Pool } from "pg";
import { config } from "../config";
import type { DB } from "../store";

/**
 * Слой PostgreSQL. Состояние приложения хранится как один JSONB-снапшот
 * (таблица app_snapshot, строка id=1). Это даёт постоянное хранилище без
 * переписывания всех роутов; нормализованную схему можно ввести позже.
 */
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const isLocal = /localhost|127\.0\.0\.1/.test(config.databaseUrl);
    pool = new Pool({
      connectionString: config.databaseUrl,
      // Облачные Postgres (Neon/Render/Supabase) требуют SSL
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS app_snapshot (
      id INT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function loadSnapshot(): Promise<DB | null> {
  const res = await getPool().query<{ data: DB }>(
    "SELECT data FROM app_snapshot WHERE id = 1",
  );
  return res.rows[0]?.data ?? null;
}

export async function saveSnapshot(data: DB): Promise<void> {
  await getPool().query(
    `INSERT INTO app_snapshot (id, data, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(data)],
  );
}
