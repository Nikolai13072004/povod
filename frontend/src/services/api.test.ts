import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authAPI,
  clearLocalSession,
  eventsAPI,
  hasCookieSession,
  hasStoredSession,
  setCsrfToken,
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

  it("шлёт CSRF-заголовок из ответа, когда кука API не видна (разные домены)", async () => {
    // На кросс-доменном развёртывании `document.cookie` не показывает куку,
    // выставленную доменом API, — а сессионную куку браузер при этом отправляет.
    // Без запасного пути сервер требовал заголовок, взять его было неоткуда, и
    // любой изменяющий запрос упирался в 403. Поймано на настоящем деплое.
    setCsrfToken("derived-from-session");
    const fetchMock = mockFetch();

    await eventsAPI.create({ title: "Встреча" } as never);

    expect(lastHeaders(fetchMock)["x-csrf-token"]).toBe("derived-from-session");
  });

  it("сохранённый CSRF-токен переживает открытие новой вкладки", async () => {
    // sessionStorage живёт в пределах вкладки, а переход по присланной ссылке
    // открывает новую: там токена не было, приложение считало, что входа нет,
    // и показывало экран входа при живой серверной сессии.
    setCsrfToken("общий-для-вкладок");
    expect(localStorage.getItem("povod.csrfToken")).toBe("общий-для-вкладок");
    expect(sessionStorage.getItem("povod.csrfToken")).toBeNull();
    expect(hasStoredSession()).toBe(true);
  });

  it("кука важнее сохранённого значения: она всегда свежая", async () => {
    setCsrfToken("устаревшее");
    setCsrfCookie("из-куки");
    const fetchMock = mockFetch();

    await eventsAPI.create({ title: "Встреча" } as never);

    expect(lastHeaders(fetchMock)["x-csrf-token"]).toBe("из-куки");
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

  it("показывает, какое поле не прошло проверку, а не «Validation failed»", async () => {
    // Сервер отвечает подробно, а раньше бралось только общее `error`: на
    // настоящей регистрации он написал «Некорректный email», а на экране
    // появилось «Validation failed» — фраза, из которой непонятно, что чинить.
    mockFetch(
      jsonResponse(400, {
        error: "Validation failed",
        status: 400,
        issues: [{ path: ["email"], message: "Некорректный email" }],
      }),
    );

    const response = await authAPI.register("123", "4131@com", "123456789");
    expect(response.error).toBe("Некорректный email");
  });

  it("склеивает несколько ошибок и подписывает поле, когда это добавляет смысл", async () => {
    mockFetch(
      jsonResponse(400, {
        error: "Validation failed",
        issues: [
          { path: ["name"], message: "Имя слишком короткое" },
          { path: ["password"], message: "Строка должна содержать минимум 8 символов" },
        ],
      }),
    );

    const response = await authAPI.register("я", "a@b.ru", "123");
    // «Имя слишком короткое» уже называет поле — подпись не дублируется.
    expect(response.error).toBe(
      "Имя слишком короткое. Пароль: Строка должна содержать минимум 8 символов",
    );
  });

  it("оставляет общее сообщение, когда подробностей нет", async () => {
    mockFetch(jsonResponse(409, { error: "Пользователь с таким email уже существует" }));

    const response = await authAPI.register("Илья", "a@b.ru", "12345678");
    expect(response.error).toBe("Пользователь с таким email уже существует");
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
