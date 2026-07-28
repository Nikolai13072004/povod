import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { logger } from "../logger.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await client.query("SELECT pg_advisory_lock(hashtext('povod_schema_migrations'))");
  try {
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => /^\d+_[a-z0-9_]+\.sql$/i.test(file))
      .sort();

    const applied = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations",
    );
    const appliedVersions = new Set(applied.rows.map((row) => row.version));

    for (const version of files) {
      if (appliedVersions.has(version)) continue;
      const sql = await fs.readFile(path.join(migrationsDir, version), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        logger.info(`[db] применена миграция ${version}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('povod_schema_migrations'))");
  }
}
