import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      /**
       * Service worker (PWA-003).
       *
       * `prompt`, а не `autoUpdate`: обновление посреди сеанса перезагружает
       * страницу и теряет то, что человек набирал в форме. Приложение само
       * спрашивает и обновляется по нажатию.
       */
      registerType: "prompt",
      // Регистрируем вручную, чтобы управлять моментом обновления из кода.
      injectRegister: null,
      // Манифест написан руками и живёт в public/ (PWA-001) — плагин его не трогает.
      manifest: false,

      workbox: {
        /**
         * Кэшируется только оболочка приложения — статика сборки.
         *
         * Ответы API не кэшируются намеренно (PWA-002): на уровне service worker
         * нельзя отличить открытое событие от закрытого, а положить приватные
         * данные в общий кэш браузера — значит оставить их там после выхода из
         * аккаунта. Офлайн-режим для публичной ленты требует отдельного решения
         * с явной пометкой ответов сервером.
         */
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
        navigateFallback: "index.html",
        // Запросы к API мимо кэша, даже если они попали под navigateFallback.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },

      // В разработке service worker выключен: он кэширует модули и мешает HMR.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
});
