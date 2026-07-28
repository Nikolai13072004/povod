import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-проверки основных сценариев (QA-005).
 *
 * Модульные тесты подменяют сеть моками, поэтому не увидят, если фронт и бэкенд
 * разойдутся в контракте: именно так однажды уехал ответ ленты. Здесь поднимаются
 * оба процесса и браузер ходит по настоящему HTTP.
 *
 * Backend работает на in-memory хранилище с включённым демо-входом — база и
 * Docker не нужны, поэтому набор запускается и локально, и в CI одинаково.
 */

const FRONTEND_PORT = 5174;
const BACKEND_PORT = 8081;

export default defineConfig({
  testDir: "./e2e",
  // Проверки состязаются за общее хранилище бэкенда (например, за список
  // событий), поэтому идут по одному. Набор смоук-уровня, время терпимое.
  workers: 1,
  fullyParallel: false,
  // Локально повторы только скрыли бы нестабильность; в CI один повтор гасит
  // случайные отказы окружения.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  /**
   * По умолчанию берётся браузер, который Playwright скачивает сам, — так набор
   * воспроизводим в CI. `PLAYWRIGHT_CHANNEL=msedge` (или `chrome`) переключает
   * на уже установленный в системе: пригодится там, где загрузка закрыта сетью.
   */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
      },
    },
  ],

  webServer: [
    {
      command: "npm --prefix ../backend start",
      port: BACKEND_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PORT: String(BACKEND_PORT),
        HOST: "127.0.0.1",
        NODE_ENV: "development",
        // Без персистентности: каждый прогон начинается с одних и тех же
        // seed-данных, поэтому проверки не зависят от порядка запуска.
        PERSIST: "false",
        DATABASE_URL: "",
        ENABLE_EXTERNAL_EVENTS: "false",
        DEMO_AUTH_ENABLED: "true",
        DEMO_AUTH_PASSWORD: "povod-demo",
        CORS_ORIGIN: `http://127.0.0.1:${FRONTEND_PORT}`,
      },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT} --host 127.0.0.1`,
      port: FRONTEND_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        VITE_API_URL: `http://127.0.0.1:${BACKEND_PORT}/`,
        VITE_DEMO_AUTH_ENABLED: "true",
      },
    },
  ],
});
