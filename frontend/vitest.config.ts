/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    clearMocks: true,
    restoreMocks: true,
    // Только src: e2e/ запускается Playwright'ом, у него свой раннер (QA-005).
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
