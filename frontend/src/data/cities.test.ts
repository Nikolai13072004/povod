import { describe, expect, it } from "vitest";
import { findCity, isValidCity, searchCities, POPULAR_CITIES, RU_CITIES } from "./cities";

describe("справочник городов", () => {
  it("находит город без учёта регистра и «ё», приводя к каноническому виду", () => {
    expect(findCity("москва")).toBe("Москва");
    expect(findCity("  Санкт-Петербург ")).toBe("Санкт-Петербург");
    // «Орёл» ↔ «орел»: ё нормализуется в обе стороны.
    expect(findCity("орел")).toBe("Орёл");
  });

  it("не считает городом произвольный текст", () => {
    expect(findCity("асдф")).toBeUndefined();
    expect(findCity("")).toBeUndefined();
    expect(isValidCity("не город")).toBe(false);
    expect(isValidCity("Казань")).toBe(true);
  });

  it("на пустой ввод показывает популярные города", () => {
    expect(searchCities("")).toEqual(POPULAR_CITIES);
  });

  it("сначала совпадения по началу слова, потом по вхождению", () => {
    const result = searchCities("рск");
    // «рск» есть внутри разных городов, но начинающихся на «рск» нет —
    // значит все совпадения по вхождению.
    expect(result.every((city) => city.toLowerCase().includes("рск"))).toBe(true);

    const starts = searchCities("новоси");
    expect(starts[0]).toBe("Новосибирск");
  });

  it("ограничивает число подсказок", () => {
    expect(searchCities("а", 4).length).toBeLessThanOrEqual(4);
  });

  it("в справочнике нет дублей и все строки непустые", () => {
    expect(new Set(RU_CITIES).size).toBe(RU_CITIES.length);
    expect(RU_CITIES.every((city) => city.trim().length > 0)).toBe(true);
  });
});
