import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  hasStoredSession: vi.fn(() => true),
  hasCookieSession: vi.fn(() => true),
  clearLocalSession: vi.fn(),
  setSessionToken: vi.fn(),
  getFriends: vi.fn(async () => ({ data: [], status: 200 })),
}));

vi.mock("../services/api", () => ({
  authAPI: { session: mocks.session },
  usersAPI: { getFriends: mocks.getFriends },
  hasStoredSession: mocks.hasStoredSession,
  hasCookieSession: mocks.hasCookieSession,
  clearLocalSession: mocks.clearLocalSession,
  setSessionToken: mocks.setSessionToken,
}));

vi.mock("./EventStore", () => ({ eventStore: { resetSessionState: vi.fn() } }));
vi.mock("./filtersStore", () => ({ filtersStore: { resetSessionState: vi.fn() } }));
vi.mock("./notificationsStore", () => ({
  notificationsStore: { reset: vi.fn(), load: vi.fn(), start: vi.fn(), stop: vi.fn() },
}));
vi.mock("./favoritesStore", () => ({ favoritesStore: { reset: vi.fn(), load: vi.fn() } }));

import { sessionStore } from "./sessionStore";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStore.initialized = false;
  sessionStore.isLoading = false;
  sessionStore.authenticated = false;
  sessionStore.error = null;
});

describe("проверка сессии при старте", () => {
  it("не разлогинивает при сбое сети", async () => {
    // fetchApi отдаёт status 0 на любое исключение fetch: офлайн, таймаут,
    // сбой CORS, холодный старт бесплатного сервиса (~50 секунд). Раньше здесь
    // безусловно стиралась CSRF-кука, хотя серверная сессия оставалась жива, —
    // человека выкидывало на вход, а запись отвечала 403 «CSRF token missing».
    mocks.session.mockResolvedValue({ error: "Network error", status: 0 });

    await sessionStore.init();

    expect(mocks.clearLocalSession).not.toHaveBeenCalled();
    expect(sessionStore.error).toMatch(/соединение/i);
  });

  it("не разлогинивает при сбое сервера", async () => {
    mocks.session.mockResolvedValue({ error: "Bad gateway", status: 502 });

    await sessionStore.init();

    expect(mocks.clearLocalSession).not.toHaveBeenCalled();
  });

  it("разлогинивает, когда сервер действительно отверг сессию", async () => {
    mocks.session.mockResolvedValue({ error: "Unauthorized", status: 401 });

    await sessionStore.init();

    expect(mocks.clearLocalSession).toHaveBeenCalledTimes(1);
  });

  it("входит, когда сессия действительна", async () => {
    mocks.session.mockResolvedValue({
      data: { user: { id: "u1", name: "Илья", createdAt: "2026-01-01T00:00:00.000Z" } },
      status: 200,
    });

    await sessionStore.init();

    expect(sessionStore.authenticated).toBe(true);
    expect(sessionStore.user.id).toBe("u1");
    expect(mocks.clearLocalSession).not.toHaveBeenCalled();
  });
});
