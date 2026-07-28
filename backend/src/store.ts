import path from "node:path";
import { config } from "./config.js";
import type { PovodRepository } from "./repositories/repository.js";
import { MemoryRepository } from "./repositories/memoryRepository.js";

let repository: PovodRepository | undefined;

export async function initStore(): Promise<void> {
  if (config.databaseUrl) {
    const [{ getPool }, { PostgresRepository }] = await Promise.all([
      import("./db/pg.js"),
      import("./repositories/postgresRepository.js"),
    ]);
    repository = new PostgresRepository(getPool());
  } else {
    const persistFile = config.persist ? path.resolve(process.cwd(), "data", "db.json") : undefined;
    repository = new MemoryRepository(persistFile);
  }
  await repository.init();
  const { initAuth } = await import("./auth/bootstrap.js");
  await initAuth();
}

export function getRepository(): PovodRepository {
  if (!repository) {
    throw new Error("Data store is not initialized");
  }
  return repository;
}

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
