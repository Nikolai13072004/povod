import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTE, ONBOARDING_ROUTE, afterAuthRoute } from "./afterAuthRoute";

describe("куда вести после входа", () => {
  it("возвращает на запрошенный адрес вместе с фильтрами", () => {
    // Ради этого всё и затевалось: ссылка на подборку несёт фильтры в query.
    // Раньше сохранялся только путь, и человек попадал в ленту без фильтров —
    // пересланная ссылка теряла смысл.
    expect(afterAuthRoute(true, "/page-1?category=Музыка&startsFrom=2026-08-01")).toBe(
      "/page-1?category=Музыка&startsFrom=2026-08-01",
    );
    expect(afterAuthRoute(true, "/page-1/42")).toBe("/page-1/42");
  });

  it("онбординг важнее места назначения", () => {
    // Без интересов лента не персонализируется, а профиль остаётся пустым.
    expect(afterAuthRoute(false, "/page-1?category=Музыка")).toBe(ONBOARDING_ROUTE);
  });

  it("без запрошенного адреса ведёт в ленту", () => {
    expect(afterAuthRoute(true)).toBe(DEFAULT_ROUTE);
    expect(afterAuthRoute(true, "")).toBe(DEFAULT_ROUTE);
  });

  it("не уводит на чужой хост", () => {
    // `//evil.example` браузер понимает как адрес на чужом хосте с текущей
    // схемой, поэтому проверки на ведущий слэш мало.
    expect(afterAuthRoute(true, "//evil.example/phishing")).toBe(DEFAULT_ROUTE);
    expect(afterAuthRoute(true, "https://evil.example")).toBe(DEFAULT_ROUTE);
    expect(afterAuthRoute(true, "/\\evil.example")).toBe(DEFAULT_ROUTE);
    expect(afterAuthRoute(true, "/%5Cevil.example")).toBe(DEFAULT_ROUTE);
  });

  it("не возвращает на сам экран входа — получилась бы петля", () => {
    expect(afterAuthRoute(true, "/")).toBe(DEFAULT_ROUTE);
    expect(afterAuthRoute(true, "/?mode=login")).toBe(DEFAULT_ROUTE);
  });
});
