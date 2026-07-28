import { beforeEach, describe, expect, it } from "vitest";
import { FilterState } from "./filtersStore";
import { filtersToSearchParams, searchParamsToFilters, shareableFilterUrl } from "./filterParams";

let filters: FilterState;

beforeEach(() => {
  filters = new FilterState();
});

describe("фильтры в адресной строке", () => {
  it("не добавляет в ссылку пустые фильтры", () => {
    expect(filtersToSearchParams(filters).toString()).toBe("");
  });

  it("переносит выбор в ссылку и обратно без потерь", () => {
    filters.setSearch("волейбол");
    filters.setDate("2026-08-01");
    filters.setLocation("Круглотский сад");
    filters.setTimeRange("18:00", "22:00");
    filters.toggleInterest("1");
    filters.toggleInterest("7");

    const params = filtersToSearchParams(filters);
    const restored = searchParamsToFilters(params);

    expect(restored).toEqual({
      search: "волейбол",
      date: "2026-08-01",
      location: "Круглотский сад",
      startTime: "18:00",
      endTime: "22:00",
      interestIds: ["1", "7"],
    });
  });

  it("даёт одинаковую ссылку независимо от порядка выбора интересов", () => {
    filters.toggleInterest("7");
    filters.toggleInterest("1");
    const first = filtersToSearchParams(filters).toString();

    const other = new FilterState();
    other.toggleInterest("1");
    other.toggleInterest("7");

    // Иначе две одинаковые подборки дают разные ссылки, и это заметно при пересылке.
    expect(first).toBe(filtersToSearchParams(other).toString());
  });

  it("не кладёт в ссылку половину диапазона времени", () => {
    filters.setTimeRange("18:00", "");
    // Одна граница фильтр не включает — в ссылке ей делать нечего.
    expect(filtersToSearchParams(filters).toString()).toBe("");
  });

  it("обрезает пробелы вокруг текста", () => {
    filters.setSearch("  йога  ");
    filters.setLocation("  парк  ");
    const restored = searchParamsToFilters(filtersToSearchParams(filters));
    expect(restored.search).toBe("йога");
    expect(restored.location).toBe("парк");
  });

  describe("разбор чужой ссылки", () => {
    it("отбрасывает неизвестные интересы", () => {
      // Ссылку мог собрать кто угодно; несуществующий интерес просто игнорируем.
      const parsed = searchParamsToFilters(new URLSearchParams("i=1,999,%3Cscript%3E,7"));
      expect(parsed.interestIds).toEqual(["1", "7"]);
    });

    it("убирает дубли интересов", () => {
      expect(searchParamsToFilters(new URLSearchParams("i=1,1,1")).interestIds).toEqual(["1"]);
    });

    it("отбрасывает неверные дату и время целиком", () => {
      const parsed = searchParamsToFilters(new URLSearchParams("date=вчера&from=25:00&to=10:00"));
      expect(parsed.date).toBe("");
      // Одна испорченная граница делает бессмысленным весь диапазон.
      expect(parsed.startTime).toBe("");
      expect(parsed.endTime).toBe("");
    });

    it("ограничивает длину текста", () => {
      const parsed = searchParamsToFilters(new URLSearchParams(`q=${"а".repeat(500)}`));
      expect(parsed.search).toHaveLength(100);
    });

    it("не падает на пустой строке запроса", () => {
      expect(searchParamsToFilters(new URLSearchParams("")).interestIds).toEqual([]);
    });
  });

  it("собирает ссылку для пересылки", () => {
    filters.setSearch("йога");
    expect(shareableFilterUrl(filters, "https://povod.app", "/page-1")).toBe(
      "https://povod.app/page-1?q=%D0%B9%D0%BE%D0%B3%D0%B0",
    );

    // Без фильтров вопросительный знак в конце не нужен.
    expect(shareableFilterUrl(new FilterState(), "https://povod.app", "/page-1")).toBe(
      "https://povod.app/page-1",
    );
  });
});
