import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "backend/data/**",
      "scripts/**",
      // Генерируется из docs/openapi.json — правки бессмысленны (ARCH-002).
      "frontend/src/services/schema.d.ts",
      "**/*.config.js",
      "**/*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Frontend: React + browser
    files: ["frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Вспомогательные скрипты сборки во frontend исполняются в Node, а не в браузере.
    files: [
      "frontend/scripts/**/*.mjs",
      "backend/scripts/**/*.mjs",
      "frontend/src/**/*.test.{ts,tsx}",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Backend: Node
    files: ["backend/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    // Логи должны идти через централизованный logger с редакцией секретов/PII (SEC-003).
    rules: {
      "no-console": "warn",
    },
  },
  {
    // Единственное допустимое место прямого console — сам logger.
    files: ["backend/src/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Прагматичный baseline: тулинг настроен, существующие замечания — предупреждения.
    // Ужесточение правил вынесено в отдельную задачу (QA-002).
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "no-empty": "warn",
      "no-extra-boolean-cast": "warn",
      "no-useless-escape": "warn",
      "no-control-regex": "warn",
    },
  },
);
