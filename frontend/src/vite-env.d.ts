/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEMO_AUTH_ENABLED?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
