import { Pool } from "pg";
import { config } from "../config.js";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) return pool;
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL");

  const hostname = new URL(config.databaseUrl).hostname;
  const isLocal = ["localhost", "127.0.0.1", "::1", "postgres", "db"].includes(hostname);
  const useSsl = config.databaseSsl === "true" || (config.databaseSsl !== "false" && !isLocal);

  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
  return pool;
}

/** Закрывает пул соединений, если он был создан. Безопасно вызывать всегда (BE-001). */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}
