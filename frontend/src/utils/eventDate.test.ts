import { describe, expect, it } from "vitest";
import {
  browserTimezone,
  eventDateKey,
  eventTimeKey,
  filterDateKey,
  formatEventDate,
  formatEventTime,
  localDateTimeToIso,
} from "./eventDate";

// Опорный момент: 2026-06-27T22:30Z. В Москве (UTC+3) это уже 28-е 01:30,
// в Нью-Йорке (EDT, UTC-4) — 27-е 18:30.
const INSTANT = "2026-06-27T22:30:00.000Z";

describe("formatEventDate / formatEventTime", () => {
  it("formats in Europe/Moscow (UTC+3)", () => {
    expect(formatEventDate(INSTANT, "Europe/Moscow")).toBe("28.06.2026");
    expect(formatEventTime(INSTANT, "Europe/Moscow")).toBe("01:30");
  });

  it("formats the same instant differently in America/New_York (UTC-4 in June)", () => {
    expect(formatEventDate(INSTANT, "America/New_York")).toBe("27.06.2026");
    expect(formatEventTime(INSTANT, "America/New_York")).toBe("18:30");
  });
});

describe("eventDateKey / eventTimeKey", () => {
  it("derives timezone-local sort keys", () => {
    expect(eventDateKey(INSTANT, "Europe/Moscow")).toBe("2026-06-28");
    expect(eventTimeKey(INSTANT, "Europe/Moscow")).toBe("01:30");
    expect(eventDateKey(INSTANT, "America/New_York")).toBe("2026-06-27");
    expect(eventTimeKey(INSTANT, "America/New_York")).toBe("18:30");
  });

  it("throws on an invalid date", () => {
    expect(() => eventDateKey("not-a-date", "Europe/Moscow")).toThrow();
  });
});

describe("filterDateKey", () => {
  it("converts DD.MM.YYYY to a sortable YYYY-MM-DD", () => {
    expect(filterDateKey("27.06.2026")).toBe("2026-06-27");
  });

  it("returns empty string for malformed input", () => {
    expect(filterDateKey("2026-06-27")).toBe("");
    expect(filterDateKey("nonsense")).toBe("");
    expect(filterDateKey("")).toBe("");
  });
});

describe("localDateTimeToIso", () => {
  it("converts a local date/time to a UTC instant (Europe/Moscow)", () => {
    expect(localDateTimeToIso("2026-06-27", "18:00", "Europe/Moscow")).toBe(
      "2026-06-27T15:00:00.000Z",
    );
  });

  it("respects a different timezone (America/New_York, EDT)", () => {
    expect(localDateTimeToIso("2026-06-27", "18:00", "America/New_York")).toBe(
      "2026-06-27T22:00:00.000Z",
    );
  });

  it("defaults an empty time to 00:00", () => {
    expect(localDateTimeToIso("2026-06-27", "", "Europe/Moscow")).toBe("2026-06-26T21:00:00.000Z");
  });

  it("rejects a local time that does not exist due to DST spring-forward", () => {
    // 2026-03-08 в America/New_York часы прыгают 02:00 -> 03:00, поэтому 02:30 не существует.
    expect(() => localDateTimeToIso("2026-03-08", "02:30", "America/New_York")).toThrow(
      /не существует/,
    );
  });

  it("accepts an ambiguous DST fall-back time (resolves to a valid instant)", () => {
    // 2026-11-01 в America/New_York 01:30 встречается дважды; функция не должна падать.
    const iso = localDateTimeToIso("2026-11-01", "01:30", "America/New_York");
    expect(eventTimeKey(iso, "America/New_York")).toBe("01:30");
  });

  it("rejects malformed date and time", () => {
    expect(() => localDateTimeToIso("27/06/2026", "18:00", "Europe/Moscow")).toThrow(
      /Некорректная дата/,
    );
    expect(() => localDateTimeToIso("2026-06-27", "25:00", "Europe/Moscow")).toThrow(
      /Некорректное время/,
    );
  });
});

describe("browserTimezone", () => {
  it("returns a non-empty timezone string", () => {
    const tz = browserTimezone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
  });
});
