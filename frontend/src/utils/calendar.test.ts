import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_MINUTES,
  buildEventIcs,
  escapeIcsText,
  icsFileName,
  googleCalendarUrl,
} from "./calendar";

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
    // Автор не указал окончание — берём длительность по умолчанию. Без DTEND
    // календари растянули бы событие на весь день.
    expect(ics).toContain("DTEND:20260627T170000Z");
    expect(DEFAULT_DURATION_MINUTES).toBe(120);
    expect(ics).toContain("DTSTAMP:20260601T100000Z");
  });

  it("prefers the real end time over the default guess (BE-006)", () => {
    const ics = buildEventIcs({ ...event, endsAt: "2026-06-27T19:30:00.000Z" }, NOW);
    expect(ics).toContain("DTEND:20260627T193000Z");
  });

  it("falls back to the default when the end time is broken or before the start", () => {
    // Данные могли прийти из старой записи или чужого импорта — календарь с
    // отрицательной длительностью открывать нечем.
    expect(buildEventIcs({ ...event, endsAt: "не дата" }, NOW)).toContain("DTEND:20260627T170000Z");
    expect(buildEventIcs({ ...event, endsAt: "2026-06-27T10:00:00.000Z" }, NOW)).toContain(
      "DTEND:20260627T170000Z",
    );
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

describe("ссылка в Google Календарь", () => {
  it("несёт название, время в UTC и место", () => {
    // Запасной путь для телефонов: скачивание .ics там зависит от браузера,
    // настроек и наличия приложения-календаря, а обычная ссылка работает везде.
    const url = new URL(
      googleCalendarUrl({
        id: "1",
        title: "Пикник",
        startsAt: "2026-08-01T12:00:00.000Z",
        endsAt: "2026-08-01T15:00:00.000Z",
        location: "Парк",
        description: "Берём пледы",
        url: "https://povod.example/page-1/1",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("text")).toBe("Пикник");
    // UTC, чтобы формат не зависел от часового пояса устройства.
    expect(url.searchParams.get("dates")).toBe("20260801T120000Z/20260801T150000Z");
    expect(url.searchParams.get("location")).toBe("Парк");
    expect(url.searchParams.get("details")).toContain("https://povod.example/page-1/1");
  });

  it("без окончания берёт длительность по умолчанию", () => {
    const url = new URL(
      googleCalendarUrl({ id: "1", title: "Встреча", startsAt: "2026-08-01T12:00:00.000Z" }),
    );
    expect(url.searchParams.get("dates")).toBe("20260801T120000Z/20260801T140000Z");
  });
});
