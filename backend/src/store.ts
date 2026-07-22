import fs from "node:fs";
import path from "node:path";
import type { Event, User, Comment } from "./types";
import { seedUsers, seedEvents, seedComments } from "./seed";
import { config } from "./config";

/**
 * Хранилище данных: всё в памяти, а персист — в одном из режимов:
 *   - PostgreSQL (если задан DATABASE_URL) — JSONB-снапшот, переживает рестарты;
 *   - JSON-файл data/db.json (локально, если PERSIST!=false);
 *   - чистый in-memory (иначе).
 * Слой изолирован: роуты работают с массивами db.*, не зная о бэкенде хранения.
 */
export interface DB {
  users: User[];
  events: Event[];
  comments: Comment[];
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function freshSeed(): DB {
  return {
    users: structuredClone(seedUsers),
    events: structuredClone(seedEvents),
    comments: structuredClone(seedComments),
  };
}

// Стартуем с засеянного состояния; initStore() может заменить его данными из БД/файла.
export const db: DB = freshSeed();

function replaceDb(next: Partial<DB>): void {
  db.users = next.users ?? [];
  db.events = next.events ?? [];
  db.comments = next.comments ?? [];
}

let usePg = false;

/**
 * Асинхронная инициализация хранилища. Вызывать ДО app.listen().
 * Порядок: PostgreSQL → JSON-файл → in-memory seed.
 */
export async function initStore(): Promise<void> {
  if (config.databaseUrl) {
    const { ensureSchema, loadSnapshot, saveSnapshot } = await import("./db/pg");
    await ensureSchema();
    const snap = await loadSnapshot();
    if (snap) {
      replaceDb(snap);
      console.log("[store] данные загружены из PostgreSQL");
    } else {
      await saveSnapshot(db); // первый запуск — сохраняем seed
      console.log("[store] PostgreSQL пуст — засеяно демо-данными");
    }
    usePg = true;
    return;
  }

  if (config.persist && fs.existsSync(DB_FILE)) {
    try {
      replaceDb(JSON.parse(fs.readFileSync(DB_FILE, "utf-8")));
      console.log(`[store] данные загружены из ${DB_FILE}`);
    } catch (err) {
      console.warn("[store] db.json повреждён, использую seed:", err);
    }
  }
}

let saveTimer: NodeJS.Timeout | null = null;

/** Дебаунс-сохранение текущего состояния (Postgres или JSON-файл; no-op для чистого in-memory). */
export function save(): void {
  if (usePg) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const { saveSnapshot } = await import("./db/pg");
        await saveSnapshot(db);
      } catch (err) {
        console.error("[store] ошибка записи в PostgreSQL:", err);
      }
    }, 200);
    return;
  }

  if (!config.persist) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
      console.error("[store] ошибка записи на диск:", err);
    }
  }, 50);
}

/** Генерация id (нативный crypto в Node 20, с фолбэком). */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
