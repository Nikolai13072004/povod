import assert from "node:assert/strict";
import test from "node:test";
import { createGracefulShutdown, type ClosableServer } from "./shutdown.js";

/** Заглушка сервера: `immediate` сразу зовёт callback, `never` — никогда. */
function fakeServer(behavior: "immediate" | "never"): {
  server: ClosableServer;
  closeCalls: () => number;
} {
  let calls = 0;
  const server: ClosableServer = {
    close(callback?: (error?: Error) => void) {
      calls += 1;
      if (behavior === "immediate") callback?.();
      return server;
    },
  };
  return { server, closeCalls: () => calls };
}

test("graceful shutdown closes the server, stops cleanup and closes the pool", async () => {
  const { server, closeCalls } = fakeServer("immediate");
  let poolClosed = 0;
  let cleanupStopped = 0;

  const shutdown = createGracefulShutdown({
    server,
    closePool: async () => {
      poolClosed += 1;
    },
    stopCleanup: () => {
      cleanupStopped += 1;
    },
  });

  await shutdown("test");

  assert.equal(closeCalls(), 1);
  assert.equal(cleanupStopped, 1);
  assert.equal(poolClosed, 1);
});

test("graceful shutdown is idempotent", async () => {
  const { server, closeCalls } = fakeServer("immediate");
  let poolClosed = 0;

  const shutdown = createGracefulShutdown({
    server,
    closePool: async () => {
      poolClosed += 1;
    },
  });

  await shutdown();
  await shutdown();

  assert.equal(closeCalls(), 1);
  assert.equal(poolClosed, 1);
});

test("graceful shutdown completes even if in-flight requests do not finish in time", async () => {
  const { server } = fakeServer("never");
  let poolClosed = 0;

  const shutdown = createGracefulShutdown({
    server,
    closePool: async () => {
      poolClosed += 1;
    },
    timeoutMs: 20,
  });

  await shutdown();
  // Пул закрыт несмотря на «зависшие» соединения — сработал таймаут.
  assert.equal(poolClosed, 1);
});
