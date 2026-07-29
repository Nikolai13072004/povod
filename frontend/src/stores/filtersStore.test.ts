import { beforeEach, describe, expect, it } from "vitest";
import { FilterState, INTEREST_CATALOG, filtersStore } from "./filtersStore";

describe("FilterState", () => {
  let filters: FilterState;

  beforeEach(() => {
    filters = new FilterState();
  });

  it("starts empty and without active filters", () => {
    expect(filters.hasActiveFilters).toBe(false);
    expect(filters.selectedInterests).toEqual([]);
    expect(filters.timeActive).toBe(false);
  });

  it("treats a non-empty search as an active filter", () => {
    filters.setSearch("волейбол");
    expect(filters.hasActiveFilters).toBe(true);

    filters.setSearch("   ");
    expect(filters.hasActiveFilters).toBe(false);
  });

  it("counts the time range as active only when both bounds are set", () => {
    filters.setTimeRange("16:00", "");
    expect(filters.timeActive).toBe(false);

    filters.setTimeRange("16:00", "18:00");
    expect(filters.timeActive).toBe(true);
    expect(filters.hasActiveFilters).toBe(true);
  });

  it("toggles interests and exposes their labels", () => {
    const sport = INTEREST_CATALOG[0]!;
    filters.toggleInterest(sport.id);

    expect(filters.selectedInterests).toEqual([sport.label]);
    expect(filters.interestOptions.find((option) => option.id === sport.id)?.selected).toBe(true);
    expect(filters.hasActiveFilters).toBe(true);

    filters.toggleInterest(sport.id);
    expect(filters.selectedInterests).toEqual([]);
    expect(filters.hasActiveFilters).toBe(false);
  });

  it("reset clears every field", () => {
    filters.setSearch("тест");
    filters.setDate("27.06.2026");
    filters.setLocation("Москва");
    filters.setTimeRange("10:00", "12:00");
    filters.toggleInterest("2");
    expect(filters.hasActiveFilters).toBe(true);

    filters.reset();

    expect(filters.search).toBe("");
    expect(filters.date).toBe("");
    expect(filters.location).toBe("");
    expect(filters.startTime).toBe("");
    expect(filters.endTime).toBe("");
    expect(filters.selectedInterests).toEqual([]);
    expect(filters.hasActiveFilters).toBe(false);
  });
});

describe("filtersStore", () => {
  beforeEach(() => {
    filtersStore.resetAll();
  });

  it("keeps feed and my-events filters independent", () => {
    filtersStore.feed.setSearch("лента");
    filtersStore.myEvents.setSearch("мои");

    expect(filtersStore.feed.search).toBe("лента");
    expect(filtersStore.myEvents.search).toBe("мои");
  });

  it("survives as module state so filters outlive page unmounts", () => {
    filtersStore.feed.setDate("27.06.2026");
    // Повторное обращение к стору (как при возврате на страницу) отдаёт то же значение.
    expect(filtersStore.feed.date).toBe("27.06.2026");
    expect(filtersStore.feed.hasActiveFilters).toBe(true);
  });

  it("resetAll clears both sets (used on logout)", () => {
    filtersStore.feed.setSearch("a");
    filtersStore.myEvents.setLocation("Москва");

    filtersStore.resetAll();

    expect(filtersStore.feed.hasActiveFilters).toBe(false);
    expect(filtersStore.myEvents.hasActiveFilters).toBe(false);
  });
});

describe("myEventsTab (FE-008)", () => {
  beforeEach(() => {
    filtersStore.resetAll();
  });

  it("defaults to the events the person actually attends", () => {
    // Вкладки «Все» больше нет: автор события автоматически становится его
    // участником, поэтому «Все» почти всегда совпадали с «Посещаю».
    expect(filtersStore.myEventsTab).toBe("attending");
  });

  it("switches the active tab and survives page unmounts", () => {
    filtersStore.setMyEventsTab("created");
    expect(filtersStore.myEventsTab).toBe("created");

    filtersStore.setMyEventsTab("attending");
    expect(filtersStore.myEventsTab).toBe("attending");
  });

  it("returns to the default tab on logout", () => {
    filtersStore.setMyEventsTab("created");
    filtersStore.resetAll();
    expect(filtersStore.myEventsTab).toBe("attending");
  });
});
