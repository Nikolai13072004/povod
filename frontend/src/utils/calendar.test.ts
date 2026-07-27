import { describe, expect, it } from "vitest";
import { DEFAULT_DURATION_MINUTES, buildEventIcs, escapeIcsText, icsFileName } from "./calendar";

const event = {
  id: "1",
  title: "Пляжный волейбол",
  description: "Играем на песке",
  location: "Круглотский сад",
  startsAt: "2026-06-27T15:00:00.000Z",
  url: "https://povod.app/page-1/1",
};

const NOW = new Date("2026-06-01T10:00:00.000Z");

describe("buildEventIcs", () => {
  it("produces a valid single-event calendar", () => {
    const ics = buildEventIcs(event, NOW);
    const lines = ics.split("\r\n");

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:povod-1@povod.app");
  });

  it("writes start and end as UTC timestamps", () => {
    const ics = buildEventIcs(event, NOW);
    expect(ics).toContain("DTSTART:20260627T150000Z");
    // Конец = начало + длительность по умолчанию (API пока не отдаёт endsAt, см. BE-006).
    expect(ics).toContain("DTEND:20260627T170000Z");
    expect(DEFAULT_DURATION_MINUTES).toBe(120);
    expect(ics).toContain("DTSTAMP:20260601T100000Z");
  });

  it("carries the event details", () => {
    const ics = buildEventIcs(event, NOW);
    expect(ics).toContain("SUMMARY:Пляжный волейбол");
    expect(ics).toContain("LOCATION:Круглотский сад");
    expect(ics).toContain("URL:https://povod.app/page-1/1");
  });

  it("uses CRLF line endings as the spec requires", () => {
    const ics = buildEventIcs(event, NOW);
    expect(ics.includes("\r\n")).toBe(true);
    expect(ics.split("\r\n").some((line) => line.endsWith("\r"))).toBe(false);
  });

  it("omits optional fields that are missing", () => {
    const ics = buildEventIcs({ id: "2", title: "Без деталей", startsAt: event.startsAt }, NOW);
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("URL:");
  });

  it("rejects an invalid start date", () => {
    expect(() => buildEventIcs({ id: "3", title: "Плохая дата", startsAt: "не дата" })).toThrow();
  });
});

describe("escapeIcsText", () => {
  it("escapes the characters reserved by the format", () => {
    expect(escapeIcsText("Кино, попкорн; всё")).toBe("Кино\\, попкорн\\; всё");
    expect(escapeIcsText("путь\\сюда")).toBe("путь\\\\сюда");
    expect(escapeIcsText("первая\nвторая")).toBe("первая\\nвторая");
  });

  it("keeps escaped text on one physical line", () => {
    const ics = buildEventIcs(
      {
        id: "4",
        title: "Встреча",
        description: "Первая строка\nВторая строка",
        startsAt: event.startsAt,
      },
      NOW,
    );
    expect(ics).toContain("DESCRIPTION:Первая строка\\nВторая строка");
  });
});

describe("icsFileName", () => {
  it("builds a safe file name", () => {
    expect(icsFileName("Пляжный волейбол")).toBe("Пляжный-волейбол.ics");
    expect(icsFileName('Кино: "Человек-паук" ?')).toBe("Кино-Человек-паук.ics");
  });

  it("falls back when the title has nothing usable", () => {
    expect(icsFileName("   ")).toBe("povod-event.ics");
  });
});
