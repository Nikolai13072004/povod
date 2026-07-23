function readBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be either "true" or "false"`);
}

function readApiBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || "http://localhost:8080/";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("VITE_API_URL must be an absolute URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("VITE_API_URL must use HTTP or HTTPS");
  }
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

export const appConfig = Object.freeze({
  apiBaseUrl: readApiBaseUrl(import.meta.env.VITE_API_URL),
  demoAuthEnabled: readBoolean(
    "VITE_DEMO_AUTH_ENABLED",
    import.meta.env.VITE_DEMO_AUTH_ENABLED,
    false,
  ),
});
