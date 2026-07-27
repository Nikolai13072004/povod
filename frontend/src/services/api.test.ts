import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authAPI,
  clearLocalSession,
  eventsAPI,
  hasCookieSession,
  hasStoredSession,
  setSessionToken,
} from "./api";

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function mockFetch(response = jsonResponse(200)) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Заголовки последнего запроса — в единообразном виде, без учёта регистра. */
function lastHeaders(fetchMock: ReturnType<typeof mockFetch>): Record<string, string> {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  const entries = Object.entries((init?.headers ?? {}) as Record<string, string>);
  return Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), value]));
}

function setCsrfCookie(value: string) {
  document.cookie = `povod_csrf=${value}; Path=/`;
}

describe("транспорт API и признаки сессии", () => {
  beforeEach(() => {
    clearLocalSession();
    vi.unstubAllGlobals();
  });

  it("отправляет куки и дублирует CSRF-токен в заголовок", async () => {
    setCsrfCookie("csrf-value");
    const fetchMock = mockFetch();

    await eventsAPI.join("42");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    // Без credentials браузер не приложит HttpOnly-куку к cross-origin запросу.
    expect(init.credentials).toBe("include");
    expect(lastHeaders(fetchMock)["x-csrf-token"]).toBe("csrf-value");
  });

  it("не отправляет токен в заголовке, когда сессия живёт в куке", async () => {
    setCsrfCookie("csrf-value");
    setSessionToken("legacy-token"); // остаток прежней схемы с sessionStorage
    const fetchMock = mockFetch();

    await eventsAPI.getAll();

    // Суть SEC-001: при рабочих куках токен в запрос не подставляется.
    expect(lastHeaders(fetchMock).authorization).toBeUndefined();
  });

  it("падает на резервный Bearer, если куки недоступны", async () => {
    setSessionToken("vk-fallback-token");
    const fetchMock = mockFetch();

    await eventsAPI.getAll();

    const headers = lastHeaders(fetchMock);
    // VK Mini App внутри iframe: сторонние куки может резать браузер.
    expect(headers.authorization).toBe("Bearer vk-fallback-token");
    expect(headers["x-csrf-token"]).toBeUndefined();
  });

  it("считает сессию существующей и по куке, и по резервному токену", () => {
    expect(hasStoredSession()).toBe(false);

    setSessionToken("vk-fallback-token");
    expect(hasStoredSession()).toBe(true);
    expect(hasCookieSession()).toBe(false);

    setCsrfCookie("csrf-value");
    expect(hasCookieSession()).toBe(true);
  });

  it("сбрасывает локальную сессию и оповещает приложение при 401", async () => {
    setCsrfCookie("csrf-value");
    setSessionToken("stale-token");
    mockFetch(jsonResponse(401, { error: "Authentication required" }));
    const onUnauthorized = vi.fn();
    window.addEventListener("povod:unauthorized", onUnauthorized);

    const result = await eventsAPI.getAll();

    expect(result.status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(hasStoredSession()).toBe(false);
    window.removeEventListener("povod:unauthorized", onUnauthorized);
  });

  it("не считает неудачный вход истёкшей сессией", async () => {
    mockFetch(jsonResponse(401, { error: "Invalid email or password" }));
    const onUnauthorized = vi.fn();
    window.addEventListener("povod:unauthorized", onUnauthorized);

    // Неверный пароль — это не «сессия истекла», баннер показывать не за что.
    await authAPI.login({ email: "a@b.c", password: "wrong" });

    expect(onUnauthorized).not.toHaveBeenCalled();
    window.removeEventListener("povod:unauthorized", onUnauthorized);
  });
});
